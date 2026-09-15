// YYYY-MM-DD 형식이면서 실제 존재하는 날짜인지 (2026-02-30 거부)
export function isDateString(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function isMonday(v: unknown): boolean {
  return isDateString(v) && new Date(`${v}T00:00:00Z`).getUTCDay() === 1;
}
