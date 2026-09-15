import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { NextResponse } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as me from "@/app/api/me/route";
import * as todos from "@/app/api/todos/route";
import * as todo from "@/app/api/todos/[id]/route";
import * as plans from "@/app/api/weekly-plans/route";
import * as plan from "@/app/api/weekly-plans/[id]/route";
import * as goals from "@/app/api/year-goals/route";
import * as goal from "@/app/api/year-goals/[id]/route";
import * as github from "@/app/auth/github/route";
import * as callback from "@/app/auth/github/callback/route";
import * as logout from "@/app/auth/logout/route";
import { createSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Session } from "@/models/Session";
import { User } from "@/models/User";
import { COLLECTIONS, migrateAddUserId } from "@/scripts/migrate-add-user-id";

let mongo: MongoMemoryServer;
const MONDAY = "2026-09-14";
const APP = "http://localhost:3000";

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
  process.env.GITHUB_CLIENT_ID = "test-client-id";
  process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
  process.env.APP_URL = APP;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const login = async (username: string) => {
  const user = await User.create({ githubId: username.length * 1000 + username.charCodeAt(0), username, avatarUrl: "https://a" });
  return { user, cookie: `session=${await createSession(user._id)}` };
};
const req = (cookie: string, body?: unknown, url = `${APP}/api`) =>
  new Request(url, { method: "POST", headers: { cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ({ status: res.status, body: res.status === 204 ? null : await res.json() });
const cookieOf = (res: Response, name: string) => (res as NextResponse).cookies.get(name);

const callbackReq = (query: string, cookie = "oauth_state=s1") =>
  new Request(`${APP}/auth/github/callback?${query}`, { headers: { cookie } });
const stubGithub = (tokenBody: object, ghUser = { id: 42, login: "octo", avatar_url: "https://avatars/42" }) => {
  const fetchMock = vi.fn(async (url: string | URL) =>
    String(url).includes("/login/oauth/access_token") ? Response.json(tokenBody) : Response.json(ghUser),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("미로그인", () => {
  it("모든 /api/** → 401 UNAUTHORIZED (쿠키 없음·위조 쿠키)", async () => {
    const id = "0123456789abcdef01234567";
    const calls: [string, (r: Request) => Promise<Response>][] = [
      ["me GET", (r) => me.GET(r)],
      ["todos GET", (r) => todos.GET(r)],
      ["todos POST", (r) => todos.POST(r)],
      ["todo GET", (r) => todo.GET(r, ctx(id))],
      ["todo PATCH", (r) => todo.PATCH(r, ctx(id))],
      ["todo DELETE", (r) => todo.DELETE(r, ctx(id))],
      ["plans GET", (r) => plans.GET(r)],
      ["plans POST", (r) => plans.POST(r)],
      ["plan GET", (r) => plan.GET(r, ctx(id))],
      ["plan PATCH", (r) => plan.PATCH(r, ctx(id))],
      ["plan DELETE", (r) => plan.DELETE(r, ctx(id))],
      ["goals GET", (r) => goals.GET(r)],
      ["goals POST", (r) => goals.POST(r)],
      ["goal GET", (r) => goal.GET(r, ctx(id))],
      ["goal PATCH", (r) => goal.PATCH(r, ctx(id))],
      ["goal DELETE", (r) => goal.DELETE(r, ctx(id))],
    ];
    for (const cookie of ["", "session=forged-token"]) {
      for (const [name, call] of calls) {
        const res = await json(await call(req(cookie, { title: "x" })));
        expect(res, name).toEqual({
          status: 401,
          body: { error: { code: "UNAUTHORIZED", message: "Login required", details: null } },
        });
      }
    }
  });

  it("만료된 세션 → 401", async () => {
    const { cookie } = await login("alice");
    await Session.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await todos.GET(req(cookie))).status).toBe(401);
  });
});

describe("GET /auth/github", () => {
  it("302 authorize URL + oauth_state 쿠키", async () => {
    const res = github.GET(new Request(`${APP}/auth/github`));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("test-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(`${APP}/auth/github/callback`);
    expect(location.searchParams.get("scope")).toBe("read:user");
    const state = cookieOf(res, "oauth_state");
    expect(state).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
    expect(state!.value).toHaveLength(43);
    expect(location.searchParams.get("state")).toBe(state!.value);
  });

  it("환경 변수 없음 → /login?error=config", async () => {
    delete process.env.GITHUB_CLIENT_SECRET;
    const res = github.GET(new Request(`${APP}/auth/github`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${APP}/login?error=config`);
  });
});

describe("GET /auth/github/callback", () => {
  it("사용자 거부 → denied, state 불일치·없음 → state (state 쿠키 항상 삭제)", async () => {
    const fetchMock = stubGithub({ access_token: "t" });
    const denied = await callback.GET(callbackReq("error=access_denied&state=s1"));
    expect(denied.headers.get("location")).toBe(`${APP}/login?error=denied`);
    for (const r of [callbackReq("code=c&state=WRONG"), callbackReq("code=c&state=s1", ""), callbackReq("code=c")]) {
      const res = await callback.GET(r);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(`${APP}/login?error=state`);
      expect(cookieOf(res, "oauth_state")).toMatchObject({ value: "", maxAge: 0, path: "/" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await User.countDocuments()).toBe(0);
  });

  it("정상 흐름 → User 저장 + 세션 문서 + session 쿠키 → 302 /, 재로그인은 upsert", async () => {
    const fetchMock = stubGithub({ access_token: "gho_test", token_type: "bearer" });
    const res = await callback.GET(callbackReq("code=c1&state=s1"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${APP}/`);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toBe("https://github.com/login/oauth/access_token");
    expect(JSON.parse(String(tokenInit.body))).toMatchObject({ client_id: "test-client-id", client_secret: "test-client-secret", code: "c1" });
    const [, userInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(userInit.headers).toMatchObject({ Authorization: "Bearer gho_test" });

    const users = await User.find();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ githubId: 42, username: "octo", avatarUrl: "https://avatars/42" });
    expect(JSON.stringify(users[0])).not.toContain("gho_test"); // access token 저장 안 함

    const session = cookieOf(res, "session");
    expect(session).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
    expect(session).not.toHaveProperty("secure", true); // production에서만 secure
    const sessions = await Session.find();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).not.toBe(session!.value); // 원문 토큰이 아닌 해시 저장
    expect(cookieOf(res, "oauth_state")).toMatchObject({ value: "", maxAge: 0 });

    const meRes = await json(await me.GET(req(`session=${session!.value}`)));
    expect(meRes).toEqual({ status: 200, body: { id: users[0].id, username: "octo", avatarUrl: "https://avatars/42" } });

    stubGithub({ access_token: "gho_test2" }, { id: 42, login: "octo-renamed", avatar_url: "https://avatars/42b" });
    expect((await callback.GET(callbackReq("code=c2&state=s1"))).headers.get("location")).toBe(`${APP}/`);
    const again = await User.find();
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ id: users[0].id, username: "octo-renamed", avatarUrl: "https://avatars/42b" });
    expect(await Session.countDocuments()).toBe(2);
  });

  it("토큰 교환 실패 → oauth, 사용자·세션 생성 없음", async () => {
    stubGithub({ error: "bad_verification_code" });
    const res = await callback.GET(callbackReq("code=bad&state=s1"));
    expect(res.headers.get("location")).toBe(`${APP}/login?error=oauth`);
    expect(cookieOf(res, "session")).toBeUndefined();
    expect(await User.countDocuments()).toBe(0);
    expect(await Session.countDocuments()).toBe(0);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect((await callback.GET(callbackReq("code=c&state=s1"))).headers.get("location")).toBe(`${APP}/login?error=oauth`);
  });
});

describe("POST /auth/logout", () => {
  it("세션 문서 삭제 + 쿠키 만료 + 303 /login, 이후 401", async () => {
    const { cookie } = await login("alice");
    const other = await login("bob");
    expect((await todos.GET(req(cookie))).status).toBe(200);
    const res = await logout.POST(req(cookie));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${APP}/login`);
    expect(cookieOf(res, "session")).toMatchObject({ value: "", maxAge: 0, path: "/", httpOnly: true });
    expect(await Session.countDocuments({ userId: (await User.findOne({ username: "alice" }))!._id })).toBe(0);
    expect((await todos.GET(req(cookie))).status).toBe(401);
    expect((await todos.GET(req(other.cookie))).status).toBe(200); // 다른 사용자 세션은 유지
  });

  it("세션 없어도 쿠키 삭제 후 303", async () => {
    const res = await logout.POST(req(""));
    expect(res.status).toBe(303);
    expect(cookieOf(res, "session")).toMatchObject({ value: "", maxAge: 0 });
  });
});

describe("사용자별 데이터 격리", () => {
  it("목록은 본인 것만, 남의 항목 GET/PATCH/DELETE → 404, 남의 상위 항목 연결 → 400", async () => {
    const a = await login("alice");
    const b = await login("bob");
    const aGoal = (await json(await goals.POST(req(a.cookie, { title: "G", year: 2026 })))).body;
    const aPlan = (await json(await plans.POST(req(a.cookie, { title: "W", weekStart: MONDAY, yearGoalId: aGoal.id })))).body;
    const aTodo = (await json(await todos.POST(req(a.cookie, { title: "T", weeklyPlanId: aPlan.id })))).body;
    expect(aTodo.userId).toBeUndefined(); // 응답에 userId 노출 안 함

    // body의 userId는 무시되고 세션 사용자로 생성
    await todos.POST(req(b.cookie, { title: "B", userId: a.user.id }));

    const list = async (cookie: string) => ({
      todos: (await json(await todos.GET(req(cookie)))).body.map((t: { title: string }) => t.title),
      plans: (await json(await plans.GET(req(cookie)))).body.length,
      goals: (await json(await goals.GET(req(cookie)))).body.length,
    });
    expect(await list(a.cookie)).toEqual({ todos: ["T"], plans: 1, goals: 1 });
    expect(await list(b.cookie)).toEqual({ todos: ["B"], plans: 0, goals: 0 });
    expect((await json(await todos.GET(req(b.cookie, undefined, `${APP}/api/todos?weeklyPlanId=${aPlan.id}`)))).body).toEqual([]);

    for (const [handlers, id] of [[todo, aTodo.id], [plan, aPlan.id], [goal, aGoal.id]] as const) {
      expect((await handlers.GET(req(b.cookie), ctx(id))).status).toBe(404);
      expect((await handlers.PATCH(req(b.cookie, { title: "hacked" }), ctx(id))).status).toBe(404);
      expect((await handlers.DELETE(req(b.cookie), ctx(id))).status).toBe(404);
    }

    const bPlan = (await json(await plans.POST(req(b.cookie, { title: "BW", weekStart: MONDAY })))).body;
    const bTodo = (await json(await todos.POST(req(b.cookie, { title: "BT" })))).body;
    const invalidRef = { code: "INVALID_REFERENCE" };
    expect(await json(await todos.POST(req(b.cookie, { title: "x", weeklyPlanId: aPlan.id })))).toMatchObject({ status: 400, body: { error: invalidRef } });
    expect(await json(await todo.PATCH(req(b.cookie, { weeklyPlanId: aPlan.id }), ctx(bTodo.id)))).toMatchObject({ status: 400, body: { error: invalidRef } });
    expect(await json(await plans.POST(req(b.cookie, { title: "x", weekStart: MONDAY, yearGoalId: aGoal.id })))).toMatchObject({ status: 400, body: { error: invalidRef } });
    expect(await json(await plan.PATCH(req(b.cookie, { yearGoalId: aGoal.id }), ctx(bPlan.id)))).toMatchObject({ status: 400, body: { error: invalidRef } });

    // A의 데이터·연결·진행률은 그대로
    expect((await json(await todo.GET(req(a.cookie), ctx(aTodo.id)))).body).toMatchObject({ title: "T", weeklyPlanId: aPlan.id });
    expect((await json(await plan.GET(req(a.cookie), ctx(aPlan.id)))).body).toMatchObject({ title: "W", yearGoalId: aGoal.id, todoCount: 1 });
    expect((await json(await goal.GET(req(a.cookie), ctx(aGoal.id)))).body.title).toBe("G");
  });
});

describe("진행률 집계 소유자 조건 (QA D2)", () => {
  it("DB에 직접 연결된 남의 할 일은 내 주간 계획 progress/todoCount에 포함 안 됨", async () => {
    const a = await login("alice");
    const b = await login("bob");
    const aPlan = (await json(await plans.POST(req(a.cookie, { title: "W", weekStart: MONDAY })))).body;
    const aTodo = (await json(await todos.POST(req(a.cookie, { title: "T", weeklyPlanId: aPlan.id })))).body;
    await todo.PATCH(req(a.cookie, { status: "done" }), ctx(aTodo.id));
    // API로는 만들 수 없는 상태를 DB에 직접 만든다: B 소유 할 일 3개(미완료)가 A의 계획에 연결
    await mongoose.connection.db!.collection("todos").insertMany(
      [1, 2, 3].map((n) => ({
        title: `b${n}`,
        date: null,
        status: "todo",
        weeklyPlanId: new mongoose.Types.ObjectId(aPlan.id),
        userId: b.user._id,
      })),
    );

    const expected = { todoCount: 1, doneCount: 1, progress: 100 };
    expect((await json(await plan.GET(req(a.cookie), ctx(aPlan.id)))).body).toMatchObject(expected);
    expect((await json(await plans.GET(req(a.cookie)))).body[0]).toMatchObject(expected);
  });
});

describe("리뷰어 제안 보강", () => {
  it("로그아웃: 다른 Origin → 403(세션·쿠키 유지), 같은 Origin·Origin 없음 → 303", async () => {
    const a = await login("alice");
    const b = await login("bob");
    const post = (cookie: string, origin?: string) =>
      logout.POST(new Request(`${APP}/auth/logout`, { method: "POST", headers: origin ? { cookie, origin } : { cookie } }));

    const cross = await post(a.cookie, "https://evil.example");
    expect(await json(cross)).toMatchObject({ status: 403, body: { error: { code: "FORBIDDEN" } } });
    expect(cross.headers.get("set-cookie")).toBeNull();
    expect(await Session.countDocuments({ userId: a.user._id })).toBe(1);
    expect((await todos.GET(req(a.cookie))).status).toBe(200);

    const same = await post(a.cookie, APP);
    expect(same.status).toBe(303);
    expect(await Session.countDocuments({ userId: a.user._id })).toBe(0);
    const noOrigin = await post(b.cookie);
    expect(noOrigin.status).toBe(303);
    expect(await Session.countDocuments({ userId: b.user._id })).toBe(0);
  });

  it("로그인 상태에서 재로그인 → 이전 세션 문서 삭제, 새 세션 1건", async () => {
    stubGithub({ access_token: "gho_1" });
    const first = cookieOf(await callback.GET(callbackReq("code=c1&state=s1")), "session")!.value;
    const oldHash = (await Session.findOne())!.tokenHash;

    stubGithub({ access_token: "gho_2" });
    const res = await callback.GET(callbackReq("code=c2&state=s1", `oauth_state=s1; session=${first}`));
    expect(res.headers.get("location")).toBe(`${APP}/`);
    const second = cookieOf(res, "session")!.value;
    expect(second).not.toBe(first);

    const sessions = await Session.find();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).not.toBe(oldHash);
    expect((await todos.GET(req(`session=${first}`))).status).toBe(401);
    expect((await todos.GET(req(`session=${second}`))).status).toBe(200);
  });

  it("GitHub avatar_url 없음 → oauth, fetch 타임아웃(AbortSignal) → oauth, 사용자·세션 생성 없음", async () => {
    const noAvatar = stubGithub({ access_token: "gho_x" }, { id: 7, login: "noavatar" } as never);
    expect((await callback.GET(callbackReq("code=c&state=s1"))).headers.get("location")).toBe(`${APP}/login?error=oauth`);
    for (const [, init] of noAvatar.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.signal).toBeInstanceOf(AbortSignal); // 두 fetch 모두 타임아웃 signal 전달
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
    );
    expect((await callback.GET(callbackReq("code=c&state=s1"))).headers.get("location")).toBe(`${APP}/login?error=oauth`);
    expect(await User.countDocuments()).toBe(0);
    expect(await Session.countDocuments()).toBe(0);
  });
});

describe("migrate-add-user-id", () => {
  it("userId 없는 문서를 사용자에게 할당, dry-run은 변경 없음, 멱등, 없는 사용자 에러", async () => {
    const db = mongoose.connection.db!;
    const a = await login("alice");
    const b = await login("bob");
    await db.collection("todos").insertMany([
      { title: "old1", date: null, status: "todo", weeklyPlanId: null },
      { title: "old2", date: null, status: "done", weeklyPlanId: null, userId: null },
      { title: "bobs", date: null, status: "todo", weeklyPlanId: null, userId: b.user._id },
    ]);
    await db.collection("weeklyplans").insertOne({ title: "oldW", weekStart: MONDAY, yearGoalId: null });
    await db.collection("yeargoals").insertOne({ title: "oldG", year: 2026 });

    await expect(migrateAddUserId(db, "nobody")).rejects.toThrow(/not found/);

    const dry = await migrateAddUserId(db, "alice", true);
    expect(dry.counts).toEqual({ todos: 2, weeklyplans: 1, yeargoals: 1 });
    expect(await db.collection("todos").countDocuments({ userId: null })).toBe(2);

    const first = await migrateAddUserId(db, "alice");
    expect(first.counts).toEqual({ todos: 2, weeklyplans: 1, yeargoals: 1 });
    const second = await migrateAddUserId(db, "alice");
    expect(second.counts).toEqual({ todos: 0, weeklyplans: 0, yeargoals: 0 });

    for (const name of COLLECTIONS) {
      expect(await db.collection(name).countDocuments({ userId: null })).toBe(0);
      expect((await db.collection(name).indexes()).map((i) => i.name)).toContain("userId_1");
    }
    expect((await db.collection("todos").findOne({ title: "bobs" }))!.userId).toEqual(b.user._id);

    // 마이그레이션된 데이터는 기존 API로 본인에게 보임
    const aTodos = (await json(await todos.GET(req(a.cookie)))).body.map((t: { title: string }) => t.title);
    expect(aTodos.sort()).toEqual(["old1", "old2"]);
    expect((await json(await plans.GET(req(a.cookie)))).body).toHaveLength(1);
    expect((await json(await goals.GET(req(a.cookie)))).body).toHaveLength(1);
  });
});
