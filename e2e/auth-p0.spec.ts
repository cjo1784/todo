import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { countSessions, createTestUser, disconnect, TAG } from "./db";

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3000";
const today = new Date().toLocaleDateString("sv-SE");
const monday = (() => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
})();
const year = new Date().getFullYear();
const GOAL = `${TAG} 목표`;
const PLAN = `${TAG} 주간`;
const T1 = `${TAG} 키보드`;
const T2 = `${TAG} 포인터`;

let alice: Awaited<ReturnType<typeof createTestUser>>;
let bob: Awaited<ReturnType<typeof createTestUser>>;

test.beforeAll(async () => {
  alice = await createTestUser("alice", -910001);
  bob = await createTestUser("bob", -910002);
});
test.afterAll(async () => {
  await disconnect();
});

const loginAs = async (context: BrowserContext, token: string) =>
  context.addCookies([{ name: "session", value: token, url: BASE, httpOnly: true, sameSite: "Lax" }]);
// dev 서버는 하이드레이션 전에 입력하면 제어 컴포넌트가 값을 덮어씀 → 목록 조회가 끝날 때까지 기다린다
const open = async (page: Page, path: string) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
};
const column = (page: Page, label: string) => page.getByRole("region", { name: new RegExp(`^${label} \\(\\d+\\)$`) });
const handle = (page: Page, title: string) => page.getByRole("button", { name: `"${title}" 이동` });
const progress = (page: Page) => page.getByRole("progressbar", { name: `${PLAN} 진행률` });

test("(a) 미로그인으로 / 접근 → /login, 로그인 버튼 표시", async ({ page }) => {
  await open(page, "/");
  await expect(page).toHaveURL(`${BASE}/login`);
  await expect(page.getByRole("link", { name: "GitHub로 로그인" })).toBeVisible();
  const res = await page.request.get("/api/todos");
  expect(res.status()).toBe(401);
});

test("/login?error=state 오류 문구, 위조 쿠키로 / 접근 → API 401 → /login에 머묾(무한 리다이렉트 없음)", async ({ page, context }) => {
  await page.goto("/login?error=state");
  // Next의 __next-route-announcer__도 role=alert라 문구로 좁힌다
  await expect(page.getByRole("alert").filter({ hasText: "보안 확인에 실패했습니다" })).toBeVisible();
  await loginAs(context, "forged-token");
  await open(page, "/");
  await expect(page).toHaveURL(`${BASE}/login`);
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(`${BASE}/login`);
});

test("(b) 목표 생성 → 주간 계획 연결 → 할 일 생성·연결 → 키보드 드래그로 완료 → 진행률 50 유지", async ({ page, context }) => {
  await loginAs(context, alice.token);

  await open(page, "/goals");
  const goalForm = page.getByRole("form", { name: "목표 추가" });
  await goalForm.getByLabel("제목").fill(GOAL);
  await goalForm.getByRole("button", { name: "+ 추가" }).click();
  await expect(page.getByText(GOAL)).toBeVisible();

  await open(page, "/weekly");
  const planForm = page.getByRole("form", { name: "주간 계획 추가" });
  await planForm.getByLabel("제목").fill(PLAN);
  await planForm.getByLabel("주 (아무 날짜나 선택)").fill(today);
  await expect(planForm.getByRole("option", { name: `${year}년 · ${GOAL}` })).toBeAttached();
  await planForm.getByLabel("1년 목표").selectOption({ label: `${year}년 · ${GOAL}` });
  await planForm.getByRole("button", { name: "+ 추가" }).click();
  const planCard = page.getByRole("listitem").filter({ hasText: PLAN });
  await expect(planCard).toContainText(GOAL);

  await open(page, "/");
  await expect(page.getByText(`${TAG} alice`)).toBeVisible(); // 헤더 사용자 이름
  const todoForm = page.getByRole("form", { name: "할 일 추가" });
  await expect(todoForm.getByRole("option", { name: `${monday} 주 · ${PLAN}` })).toBeAttached();
  for (const title of [T1, T2]) {
    await todoForm.getByPlaceholder("무엇을 해야 하나요?").fill(title);
    await todoForm.getByLabel("주간 계획").selectOption({ label: `${monday} 주 · ${PLAN}` });
    await todoForm.getByRole("button", { name: "+ 추가" }).click();
    await expect(column(page, "할 일").getByText(title)).toBeVisible();
  }
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "0");

  const patched = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/todos/"));
  await handle(page, T1).focus();
  // 방향키 사이에 dnd-kit 안내(over 갱신)를 기다린다. 연타하면 두 번째 키가 이전 over 기준으로 계산됨
  const announce = page.getByRole("status").filter({ hasText: T1 });
  await page.keyboard.press("Space");
  await expect(announce).toContainText("할 일 컬럼 위에"); // "들었습니다" 안내는 곧바로 onDragOver 안내로 바뀜
  await page.keyboard.press("ArrowRight");
  await expect(announce).toContainText("진행 중 컬럼 위에");
  await page.keyboard.press("ArrowRight");
  await expect(announce).toContainText("완료 컬럼 위에");
  await page.keyboard.press("Space");
  expect((await patched).status()).toBe(200);
  await expect(column(page, "완료").getByText(T1)).toBeVisible();
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "50");

  await page.reload({ waitUntil: "networkidle" });
  await expect(column(page, "완료").getByText(T1)).toBeVisible();
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "50");
});

test("(c) 포인터 드래그로 진행 중 이동 + 저장 실패 시 원위치", async ({ page, context }) => {
  await loginAs(context, alice.token);
  await open(page, "/");
  await expect(column(page, "할 일").getByText(T2)).toBeVisible();

  const drag = async (title: string, to: string) => {
    const from = (await handle(page, title).boundingBox())!;
    const target = (await column(page, to).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + 20, { steps: 5 });
    await page.mouse.move(target.x + target.width / 2, target.y + 80, { steps: 15 });
    await page.mouse.up();
  };

  const patched = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/todos/"));
  await drag(T2, "진행 중");
  expect((await patched).status()).toBe(200);
  await expect(column(page, "진행 중").getByText(T2)).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(column(page, "진행 중").getByText(T2)).toBeVisible();

  // 저장 실패 → 원래 컬럼으로 복귀 + 오류 문구, 서버 상태 불변
  await page.route("**/api/todos/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "Internal server error", details: null } } })
      : route.continue(),
  );
  await drag(T2, "완료");
  await expect(page.getByRole("alert").filter({ hasText: "원래 컬럼으로 되돌렸습니다" })).toBeVisible();
  await expect(column(page, "진행 중").getByText(T2)).toBeVisible();
  await page.unroute("**/api/todos/*");
  await page.reload({ waitUntil: "networkidle" });
  await expect(column(page, "진행 중").getByText(T2)).toBeVisible();
  await expect(progress(page)).toHaveAttribute("aria-valuenow", "50");
});

test("(e) 사용자 B는 A의 할 일·계획·목표를 볼 수 없고 id로 직접 접근해도 404", async ({ page, context, playwright }) => {
  const aApi = await playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie: `session=${alice.token}` } });
  const aTodos: { id: string; title: string }[] = await (await aApi.get("/api/todos")).json();
  expect(aTodos.map((t) => t.title).sort()).toEqual([T1, T2].sort());
  await aApi.dispose();

  await loginAs(context, bob.token);
  await open(page, "/");
  await expect(page.getByText(`${TAG} bob`)).toBeVisible();
  await expect(page.getByText("할 일이 없습니다. 위에서 추가해 보세요.")).toBeVisible();
  await expect(page.getByText(TAG + " 키보드")).toHaveCount(0);
  // Themed는 컬러풀·개발자 문구를 둘 다 렌더링하므로 컬러풀 쪽만 지정
  await expect(page.getByText("🗓️ 이번 주 주간 계획이 없습니다.")).toBeVisible();
  for (const path of [`/api/todos/${aTodos[0].id}`]) {
    expect((await page.request.get(path)).status()).toBe(404);
    expect((await page.request.patch(path, { data: { status: "todo" } })).status()).toBe(404);
    expect((await page.request.delete(path)).status()).toBe(404);
  }
  await open(page, "/goals");
  await expect(page.getByText("🌟 1년 목표가 없습니다. 위에서 추가해 보세요.")).toBeVisible();
});

test("(D5) /api/me가 500이면 사용자 정보 없이 로그아웃 버튼은 유지, 401이면 사용자 영역 없음", async ({ page, context }) => {
  await loginAs(context, alice.token);
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "Internal server error", details: null } } }),
  );
  await open(page, "/");
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
  await expect(page.getByText(`${TAG} alice`)).toHaveCount(0);

  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED", message: "Login required", details: null } } }),
  );
  await open(page, "/");
  await expect(page.getByRole("button", { name: "개발자 테마" })).toBeVisible();
  await expect(page.getByRole("button", { name: "로그아웃" })).toHaveCount(0);
  await page.unroute("**/api/me");
});

test("(d) 헤더 두 테마 + 로그아웃 → /login, 세션 문서 삭제, 이전 토큰으로 API 401", async ({ page, context, playwright }) => {
  await loginAs(context, alice.token);
  await open(page, "/");
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
  await page.getByRole("button", { name: /개발자 테마/ }).click();
  await expect(page.getByRole("button", { name: "logout" })).toBeVisible();
  await page.getByRole("button", { name: /개발자 테마/ }).click();

  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(`${BASE}/login`);
  expect((await context.cookies(BASE)).find((c) => c.name === "session")).toBeUndefined();
  expect((await page.request.get("/api/todos")).status()).toBe(401);
  expect(await countSessions(alice.user._id)).toBe(0);

  const stale = await playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie: `session=${alice.token}` } });
  expect((await stale.get("/api/todos")).status()).toBe(401);
  await stale.dispose();
  await open(page, "/");
  await expect(page).toHaveURL(`${BASE}/login`);
});
