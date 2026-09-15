import { describe, expect, it } from "vitest";
import { addDays, datesBetween, dayLabel, monthDays, periodLabel, shiftDate, weekDays } from "@/lib/calendar";

describe("datesBetween (여러 날짜 선택)", () => {
  it("같은 날은 하루", () => expect(datesBetween("2026-09-15", "2026-09-15")).toEqual(["2026-09-15"]));
  it("순서 무관, 월 경계 포함", () => expect(datesBetween("2026-10-01", "2026-09-29")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]));
  it("윤년 2월", () => expect(datesBetween("2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]));
});

describe("monthDays (월요일 시작 월 격자)", () => {
  it("1일이 화요일인 달: 앞 달 월요일부터 다음 달 일요일까지 35일", () => {
    const days = monthDays("2026-09-15");
    expect(days).toHaveLength(35);
    expect(days[0]).toBe("2026-08-31");
    expect(days.at(-1)).toBe("2026-10-04");
  });
  it("1일이 월요일이면 1일부터 시작", () => expect(monthDays("2026-06-10")[0]).toBe("2026-06-01"));
  it("1일이 일요일인 31일 달은 6주(42일)", () => {
    const days = monthDays("2026-03-01");
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-02-23");
    expect(days.at(-1)).toBe("2026-04-05");
  });
  it("월요일 시작 28일 2월은 딱 4주", () => expect(monthDays("2021-02-10")).toEqual(Array.from({ length: 28 }, (_, i) => addDays("2021-02-01", i))));
  it("윤년 2월은 29일 포함, 평년은 미포함", () => {
    expect(monthDays("2028-02-01")).toContain("2028-02-29");
    expect(monthDays("2027-02-01")).not.toContain("2027-02-29");
    expect(monthDays("2027-02-01")).toHaveLength(28); // 2027-02-01 월요일, 02-28 일요일 → 3월 칸 없음
    expect(monthDays("2027-02-01")).not.toContain("2027-03-01");
  });
  it("항상 월요일로 시작해 일요일로 끝남", () => {
    for (const m of ["2026-01-05", "2026-02-05", "2026-11-05", "2028-02-05"]) {
      const days = monthDays(m);
      expect(new Date(`${days[0]}T00:00:00Z`).getUTCDay()).toBe(1);
      expect(new Date(`${days.at(-1)}T00:00:00Z`).getUTCDay()).toBe(0);
      expect(days.length % 7).toBe(0);
    }
  });
});

describe("weekDays", () => {
  it("일요일은 그 주 월요일부터", () => expect(weekDays("2026-09-20")).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]));
  it("연도 경계", () => {
    const days = weekDays("2027-01-03");
    expect(days[0]).toBe("2026-12-28");
    expect(days[6]).toBe("2027-01-03");
  });
});

describe("shiftDate (이전/다음 기간)", () => {
  it("주 이동은 7일, 월·연 경계 넘음", () => {
    expect(shiftDate("week", "2026-12-28", 1)).toBe("2027-01-04");
    expect(shiftDate("week", "2026-03-02", -1)).toBe("2026-02-23");
  });
  it("월 이동은 같은 일자, 연 경계 넘음", () => {
    expect(shiftDate("month", "2026-12-15", 1)).toBe("2027-01-15");
    expect(shiftDate("month", "2026-01-15", -1)).toBe("2025-12-15");
  });
  it("월 이동 시 없는 일자는 그 달 마지막 날 (윤년 포함)", () => {
    expect(shiftDate("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftDate("month", "2028-01-31", 1)).toBe("2028-02-29");
    expect(shiftDate("month", "2026-03-31", -1)).toBe("2026-02-28");
  });
});

describe("라벨", () => {
  it("dayLabel", () => expect(dayLabel("2026-09-15")).toBe("9월 15일 화요일"));
  it("periodLabel", () => {
    expect(periodLabel("month", "2026-09-15")).toBe("2026년 9월");
    expect(periodLabel("week", "2026-09-16")).toBe("2026-09-14 ~ 09-20");
  });
});
