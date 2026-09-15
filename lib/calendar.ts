// 캘린더 날짜 계산. "YYYY-MM-DD" 문자열을 UTC로 다뤄 시간대 오차 없음. 주는 월요일 시작
import { toMonday } from "@/lib/client";

export type CalendarView = "month" | "week";

const DAY_MS = 86_400_000;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
export const WEEKDAY_HEADERS = ["월", "화", "수", "목", "금", "토", "일"];

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (date: string, n: number) => ymd(new Date(utc(date).getTime() + n * DAY_MS));

export const weekDays = (date: string) => Array.from({ length: 7 }, (_, i) => addDays(toMonday(date), i));

// 그 달을 덮는 월~일 주 단위 날짜 (28·35·42일)
export function monthDays(date: string) {
  const d = utc(date);
  const first = ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const last = ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  const start = toMonday(first);
  const count = (utc(toMonday(last)).getTime() - utc(start).getTime()) / DAY_MS + 7;
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

// 이전(-1)/다음(1) 기간. 월 이동은 일자를 그 달 마지막 날 이내로 맞춤 (1/31 → 2/28)
export function shiftDate(view: CalendarView, date: string, step: 1 | -1) {
  if (view === "week") return addDays(date, 7 * step);
  const d = utc(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + step;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return ymd(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay))));
}

export const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

// "9월 15일 화요일"
export function dayLabel(date: string) {
  const d = utc(date);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WEEKDAY[d.getUTCDay()]}요일`;
}

// 월간 "2026년 9월" / 주간 "2026-09-14 ~ 09-20"
export function periodLabel(view: CalendarView, date: string) {
  if (view === "month") return `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월`;
  const days = weekDays(date);
  return `${days[0]} ~ ${days[6].slice(5)}`;
}
