import { expect, test, type Page } from "@playwright/test";
import { createTestUser, disconnect, TAG } from "./db";

const BASE = "http://localhost:3000";
const TITLE = `${TAG} 3일 연속`;
const cell = (page: Page, date: string) => page.locator(`li[data-date="${date}"]`);

// 칸의 빈 곳(오른쪽 아래) 좌표
async function emptySpot(page: Page, date: string) {
  const box = (await cell(page, date).boundingBox())!;
  return { x: box.x + box.width - 6, y: box.y + box.height - 6 };
}

test.afterAll(disconnect);

test("캘린더: 칸 클릭 → 그날 추가 창, 여러 날짜 끌기 → 날마다 하나씩 추가", async ({ page, context }) => {
  const { token } = await createTestUser("calendar", -910101);
  await context.addCookies([{ name: "session", value: token, url: BASE, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/calendar?view=month&date=2026-09-15");
  await page.waitForLoadState("networkidle");

  // 칸 빈 곳 클릭 → 그 날짜 추가 창
  const one = await emptySpot(page, "2026-09-10");
  await page.mouse.click(one.x, one.y);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "9월 10일 목요일" })).toBeVisible();
  await dialog.getByRole("button", { name: "닫기" }).click();

  // 15일 → 17일 끌기 → 3일 추가 창
  const from = await emptySpot(page, "2026-09-15");
  const to = await emptySpot(page, "2026-09-17");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, from.y, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await expect(dialog.getByRole("heading", { name: /9월 15일 화요일 ~ 9월 17일 목요일 \(3일\)/ })).toBeVisible();

  await dialog.getByPlaceholder("무엇을 해야 하나요?").fill(TITLE);
  await dialog.getByRole("button", { name: "+ 3일에 추가" }).click();
  await expect(dialog.getByPlaceholder("무엇을 해야 하나요?")).toHaveValue("");

  const todos: { title: string; date: string; status: string }[] = await (await page.request.get("/api/todos")).json();
  const made = todos.filter((t) => t.title === TITLE);
  expect(made.map((t) => t.date).sort()).toEqual(["2026-09-15", "2026-09-16", "2026-09-17"]);
  expect(made.every((t) => t.status === "todo")).toBe(true);

  await dialog.getByRole("button", { name: "닫기" }).click();
  for (const d of ["2026-09-15", "2026-09-16", "2026-09-17"]) await expect(cell(page, d).getByText(TITLE)).toBeVisible();
});
