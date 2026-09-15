import Calendar from "@/components/Calendar";
import { isDateString } from "@/lib/date";

// 보기·기준 날짜는 URL에 둠 (?view=month|week&date=YYYY-MM-DD) → 새로고침·공유 유지. 잘못된 값은 기본값(월간·오늘)
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const { view, date } = await searchParams;
  return <Calendar view={view === "week" ? "week" : "month"} date={isDateString(date) ? date : undefined} />;
}
