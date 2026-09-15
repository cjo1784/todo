// QA 보강: auth.test.ts가 다루지 않는 인증·격리·마이그레이션 엣지 케이스
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as todos from "@/app/api/todos/route";
import * as todo from "@/app/api/todos/[id]/route";
import * as plans from "@/app/api/weekly-plans/route";
import * as plan from "@/app/api/weekly-plans/[id]/route";
import * as goals from "@/app/api/year-goals/route";
import * as goal from "@/app/api/year-goals/[id]/route";
import * as callback from "@/app/auth/github/callback/route";
import * as logout from "@/app/auth/logout/route";
import { createSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Session } from "@/models/Session";
import { Todo } from "@/models/Todo";
import { User } from "@/models/User";
import { WeeklyPlan } from "@/models/WeeklyPlan";
import { YearGoal } from "@/models/YearGoal";
import { COLLECTIONS, migrateAddUserId } from "@/scripts/migrate-add-user-id";

let mongo: MongoMemoryServer;
const APP = "http://localhost:3000";
const MONDAY = "2026-09-14";

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await connectDB();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
  await Promise.all([Session.syncIndexes(), User.syncIndexes()]);
  Object.assign(process.env, { GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret", APP_URL: APP });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

let nextGithubId = 1;
const login = async (username: string) => {
  const user = await User.create({ githubId: nextGithubId++, username, avatarUrl: "https://a" });
  return { user, cookie: `session=${await createSession(user._id)}` };
};
const req = (cookie: string, body?: unknown, url = `${APP}/api`) =>
  new Request(url, { method: "POST", headers: { cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const body = async (res: Response) => res.json();

const callbackReq = (query: string, cookie = "oauth_state=s1") =>
  new Request(`${APP}/auth/github/callback?${query}`, { headers: { cookie } });
// 토큰 교환은 성공시키고 /user 응답만 바꿔 끼운다
const stubGithub = (userResponse: () => Response, tokenResponse = () => Response.json({ access_token: "gho_x" })) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => (String(url).includes("/login/oauth/access_token") ? tokenResponse() : userResponse())),
  );

describe("body/쿼리로 소유자 바꾸기 시도", () => {
  it("PATCH·POST body의 userId는 무시되어 소유자가 바뀌지 않는다", async () => {
    const a = await login("alice");
    const b = await login("bob");
    const g = await body(await goals.POST(req(a.cookie, { title: "G", year: 2026, userId: b.user.id })));
    const p = await body(await plans.POST(req(a.cookie, { title: "W", weekStart: MONDAY, userId: b.user.id })));
    const t = await body(await todos.POST(req(a.cookie, { title: "T" })));

    expect((await todo.PATCH(req(a.cookie, { userId: b.user.id, title: "T2" }), ctx(t.id))).status).toBe(200);
    expect((await plan.PATCH(req(a.cookie, { userId: b.user.id }), ctx(p.id))).status).toBe(200);
    expect((await goal.PATCH(req(a.cookie, { userId: b.user.id }), ctx(g.id))).status).toBe(200);

    expect(String((await Todo.findById(t.id))!.userId)).toBe(a.user.id);
    expect(String((await WeeklyPlan.findById(p.id))!.userId)).toBe(a.user.id);
    expect(String((await YearGoal.findById(g.id))!.userId)).toBe(a.user.id);
    expect(await body(await todos.GET(req(b.cookie)))).toEqual([]);
  });

  it("?date= 필터도 본인 할 일만 돌려준다", async () => {
    const a = await login("alice");
    const b = await login("bob");
    await todos.POST(req(a.cookie, { title: "A", date: "2026-09-15" }));
    await todos.POST(req(b.cookie, { title: "B", date: "2026-09-15" }));
    const list = await body(await todos.GET(req(b.cookie, undefined, `${APP}/api/todos?date=2026-09-15`)));
    expect(list.map((t: { title: string }) => t.title)).toEqual(["B"]);
  });
});

describe("세션 쿠키 해석", () => {
  it("이름이 session으로 끝나는 다른 쿠키·빈 값·변조 토큰은 401, 다른 쿠키 사이의 정상 토큰은 200", async () => {
    const { cookie } = await login("alice");
    const token = cookie.slice("session=".length);
    expect((await todos.GET(req(`xsession=${token}`))).status).toBe(401);
    expect((await todos.GET(req("session="))).status).toBe(401);
    expect((await todos.GET(req(`session=${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`))).status).toBe(401);
    expect((await todos.GET(req(`session=${token}x`))).status).toBe(401);
    expect((await todos.GET(req(`theme=dev; session=${token}; other=1`))).status).toBe(200);
  });

  it("사용자 문서가 삭제되면 남은 세션으로도 401", async () => {
    const { user, cookie } = await login("alice");
    await User.deleteOne({ _id: user._id });
    expect((await todos.GET(req(cookie))).status).toBe(401);
  });
});

describe("로그아웃·로그인 흐름 방어", () => {
  it("로그아웃은 POST만 제공한다 (GET 링크·이미지로 로그아웃 유도 불가)", () => {
    expect(Object.keys(logout)).toEqual(["POST"]);
  });

  it("로그인 전에 심어 둔 session 쿠키를 재사용하지 않고 새 토큰을 발급한다 (세션 고정 방지)", async () => {
    stubGithub(() => Response.json({ id: 42, login: "octo", avatar_url: "https://avatars/42" }));
    const planted = "attacker-chosen-token";
    const res = await callback.GET(callbackReq("code=c&state=s1", `oauth_state=s1; session=${planted}`));
    expect(res.headers.get("location")).toBe(`${APP}/`);
    const issued = res.headers.getSetCookie().find((c) => c.startsWith("session="))!;
    expect(issued).not.toContain(planted);
    expect((await todos.GET(req(`session=${planted}`))).status).toBe(401);
    expect((await todos.GET(req(issued.split(";")[0]))).status).toBe(200);
  });

  it("GitHub /user 응답이 5xx·HTML·id 누락이면 oauth 오류, 사용자·세션 생성 없음", async () => {
    const bad = [
      () => new Response("boom", { status: 502 }),
      () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
      () => Response.json({ login: "octo", avatar_url: "https://a" }),
      () => Response.json({ id: "42", login: "octo", avatar_url: "https://a" }),
    ];
    for (const userResponse of bad) {
      stubGithub(userResponse);
      const res = await callback.GET(callbackReq("code=c&state=s1"));
      expect(res.headers.get("location")).toBe(`${APP}/login?error=oauth`);
      expect(res.headers.getSetCookie().some((c) => /^session=[^;]+/.test(c))).toBe(false);
    }
    stubGithub(() => Response.json({ id: 1, login: "x", avatar_url: "https://a" }), () => new Response("down", { status: 503 }));
    expect((await callback.GET(callbackReq("code=c&state=s1"))).headers.get("location")).toBe(`${APP}/login?error=oauth`);
    expect(await User.countDocuments()).toBe(0);
    expect(await Session.countDocuments()).toBe(0);
  });

  it("콜백 쿼리에 리다이렉트 대상을 넣어도 항상 같은 출처의 / 로 보낸다", async () => {
    stubGithub(() => Response.json({ id: 42, login: "octo", avatar_url: "https://a" }));
    const res = await callback.GET(callbackReq("code=c&state=s1&redirect_uri=https://evil.example&next=//evil.example"));
    expect(res.headers.get("location")).toBe(`${APP}/`);
  });

  it("같은 GitHub 계정 첫 로그인이 동시에 와도 사용자 문서는 1개", async () => {
    stubGithub(() => Response.json({ id: 7, login: "race", avatar_url: "https://a" }));
    await Promise.all([1, 2, 3].map(() => callback.GET(callbackReq("code=c&state=s1"))));
    expect(await User.countDocuments({ githubId: 7 })).toBe(1);
  });
});

describe("migrate-add-user-id 엣지", () => {
  it("dry-run은 인덱스도 만들지 않는다", async () => {
    await login("alice");
    const db = mongoose.connection.db!;
    await db.collection("todos").insertOne({ title: "old", status: "todo", date: null, weeklyPlanId: null });
    await migrateAddUserId(db, "alice", true);
    for (const name of COLLECTIONS) {
      const names = await db.collection(name).indexes().then((ix) => ix.map((i) => i.name), () => []);
      expect(names).not.toContain("userId_1");
    }
  });

  it("같은 username이 둘이면 에러, 아무 문서도 할당하지 않는다", async () => {
    await login("dup");
    await login("dup");
    const db = mongoose.connection.db!;
    await db.collection("todos").insertOne({ title: "old", status: "todo", date: null, weeklyPlanId: null });
    await expect(migrateAddUserId(db, "dup")).rejects.toThrow(/Multiple users/);
    expect(await db.collection("todos").countDocuments({ userId: null })).toBe(1);
  });
});
