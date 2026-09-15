import { describe, expect, it } from "vitest";
import { calcProgress } from "@/lib/progress";

describe("calcProgress", () => {
  it("0개면 0", () => expect(calcProgress(0, 0)).toBe(0));
  it("전부 done이면 100", () => expect(calcProgress(3, 3)).toBe(100));
  it("4개 중 1개 done이면 25", () => expect(calcProgress(1, 4)).toBe(25));
  it("정수로 반올림", () => {
    expect(calcProgress(1, 3)).toBe(33);
    expect(calcProgress(2, 3)).toBe(67);
    expect(calcProgress(1, 8)).toBe(13); // 12.5 → 13
  });
});
