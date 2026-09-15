import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as todos from "@/app/api/todos/route";
import * as todo from "@/app/api/todos/[id]/route";
import * as plans from "@/app/api/weekly-plans/route";
import * as plan from "@/app/api/weekly-plans/[id]/route";
import * as goals from "@/app/api/year-goals/route";
import * as goal from "@/app/api/year-goals/[id]/route";

let mongo: MongoMemoryServer;
const MISSING = "0123456789abcdef01234567";
const MONDAY = "2026-09-14";

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  if (mongoose.connection.db) await mongoose.connection.db.dropDatabase();
});

const req = (body?: unknown, url = "http://localhost/api") =>
  new Request(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ({ status: res.status, body: res.status === 204 ? null : await res.json() });

const createTodo = async (body: object) => (await json(await todos.POST(req(body)))).body;
const createPlan = async (body: object = {}) =>
  (await json(await plans.POST(req({ title: "W", weekStart: MONDAY, ...body })))).body;

describe("todos", () => {
  it("POST {title} → 201, status todo, id 필드", async () => {
    const { status, body } = await json(await todos.POST(req({ title: "a" })));
    expect(status).toBe(201);
    expect(body).toMatchObject({ title: "a", status: "todo", date: null, weeklyPlanId: null });
    expect(body.id).toMatch(/^[0-9a-f]{24}$/);
    expect(body._id).toBeUndefined();
  });

  it("POST 제목 없음·잘못된 날짜·잘못된 JSON → 400", async () => {
    expect((await todos.POST(req({}))).status).toBe(400);
    expect((await todos.POST(req({ title: "a", date: "2026-02-30" }))).status).toBe(400);
    expect((await todos.POST(new Request("http://x", { method: "POST", body: "{" }))).status).toBe(400);
  });

  it("PATCH {status: invalid} → 400, 정상 변경 → 200", async () => {
    const t = await createTodo({ title: "a" });
    const bad = await json(await todo.PATCH(req({ status: "invalid" }), ctx(t.id)));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
    const ok = await json(await todo.PATCH(req({ status: "doing" }), ctx(t.id)));
    expect(ok).toMatchObject({ status: 200, body: { status: "doing" } });
  });

  it("없는 id 조회·수정·삭제 → 404, 잘못된 ObjectId → 400", async () => {
    expect((await todo.GET(req(), ctx(MISSING))).status).toBe(404);
    expect((await todo.PATCH(req({ title: "b" }), ctx(MISSING))).status).toBe(404);
    expect((await todo.DELETE(req(), ctx(MISSING))).status).toBe(404);
    expect((await todo.GET(req(), ctx("bad"))).status).toBe(400);
  });

  it("없는 주간 계획 연결 → 400, null로 연결 해제", async () => {
    expect((await todos.POST(req({ title: "a", weeklyPlanId: MISSING }))).status).toBe(400);
    const p = await createPlan();
    const t = await createTodo({ title: "a", weeklyPlanId: p.id });
    expect(t.weeklyPlanId).toBe(p.id);
    const res = await json(await todo.PATCH(req({ weeklyPlanId: null }), ctx(t.id)));
    expect(res.body.weeklyPlanId).toBeNull();
  });

  it("GET 필터 ?date= ?weeklyPlanId=", async () => {
    const p = await createPlan();
    await createTodo({ title: "a", date: "2026-09-15", weeklyPlanId: p.id });
    await createTodo({ title: "b", date: "2026-09-16" });
    const byDate = await json(await todos.GET(req(undefined, "http://x/api/todos?date=2026-09-15")));
    expect(byDate.body.map((t: { title: string }) => t.title)).toEqual(["a"]);
    const byPlan = await json(await todos.GET(req(undefined, `http://x/api/todos?weeklyPlanId=${p.id}`)));
    expect(byPlan.body).toHaveLength(1);
    expect((await todos.GET(req(undefined, "http://x/api/todos?weeklyPlanId=bad"))).status).toBe(400);
  });

  it("DELETE → 204", async () => {
    const t = await createTodo({ title: "a" });
    expect((await todo.DELETE(req(), ctx(t.id))).status).toBe(204);
    expect((await todo.GET(req(), ctx(t.id))).status).toBe(404);
  });
});

describe("weekly-plans", () => {
  it("weekStart가 월요일이 아니면 400", async () => {
    expect((await plans.POST(req({ title: "W", weekStart: "2026-09-15" }))).status).toBe(400);
  });

  it("연결된 할 일 0개 → progress 0", async () => {
    const p = await createPlan();
    expect(p).toMatchObject({ todoCount: 0, doneCount: 0, progress: 0 });
  });

  it("할 일 4개 중 done 1개 → progress 25 (목록·단건)", async () => {
    const p = await createPlan();
    const ts = await Promise.all([1, 2, 3, 4].map((n) => createTodo({ title: `t${n}`, weeklyPlanId: p.id })));
    await todo.PATCH(req({ status: "done" }), ctx(ts[0].id));
    const list = await json(await plans.GET());
    expect(list.body[0]).toMatchObject({ id: p.id, todoCount: 4, doneCount: 1, progress: 25 });
    const one = await json(await plan.GET(req(), ctx(p.id)));
    expect(one.body.progress).toBe(25);
  });

  it("주간 계획 삭제 → 연결된 할 일 weeklyPlanId null", async () => {
    const p = await createPlan();
    const t = await createTodo({ title: "a", weeklyPlanId: p.id });
    expect((await plan.DELETE(req(), ctx(p.id))).status).toBe(204);
    expect((await json(await todo.GET(req(), ctx(t.id)))).body.weeklyPlanId).toBeNull();
  });

  it("없는 1년 목표 연결 → 400, 없는 id → 404", async () => {
    const p = await createPlan();
    expect((await plan.PATCH(req({ yearGoalId: MISSING }), ctx(p.id))).status).toBe(400);
    expect((await plan.PATCH(req({ title: "x" }), ctx(MISSING))).status).toBe(404);
    expect((await plan.DELETE(req(), ctx(MISSING))).status).toBe(404);
  });
});

describe("year-goals", () => {
  it("CRUD + 삭제 시 주간 계획 yearGoalId null", async () => {
    expect((await goals.POST(req({ title: "G", year: 2026.5 }))).status).toBe(400);
    const g = await json(await goals.POST(req({ title: "G", year: 2026 })));
    expect(g).toMatchObject({ status: 201, body: { title: "G", year: 2026 } });
    const p = await createPlan({ yearGoalId: g.body.id });
    expect(p.yearGoalId).toBe(g.body.id);
    expect((await json(await goal.PATCH(req({ title: "G2" }), ctx(g.body.id)))).body.title).toBe("G2");
    expect((await json(await goals.GET())).body).toHaveLength(1);
    expect((await goal.DELETE(req(), ctx(g.body.id))).status).toBe(204);
    expect((await json(await plan.GET(req(), ctx(p.id)))).body.yearGoalId).toBeNull();
    expect((await goal.GET(req(), ctx(g.body.id))).status).toBe(404);
  });
});
