"use client";

import { useId, useState } from "react";
import { api, ApiError, fieldError, STATUSES, useAction, type Status, type Todo, type WeeklyPlan } from "@/lib/client";
import { datesBetween } from "@/lib/calendar";
import { buttonClass, fieldLabelClass, FormError, inputClass, primaryButtonClass } from "@/components/ui";

const MAX_DAYS = 62;

// initial 있으면 수정(PATCH), 없으면 생성(POST). range면 종료 날짜까지 날짜마다 하나씩 생성
export default function TodoForm({
  plans,
  initial,
  defaultDate = "",
  defaultEndDate = "",
  range = false,
  onDone,
  onCancel,
}: {
  plans: WeeklyPlan[];
  initial?: Todo;
  defaultDate?: string;
  defaultEndDate?: string;
  range?: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial ? (initial.date ?? "") : defaultDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [status, setStatus] = useState<Status>(initial?.status ?? "todo");
  const [planId, setPlanId] = useState(initial?.weeklyPlanId ?? "");
  const { pending, error, run } = useAction();
  const dates = range && !initial && date && endDate ? datesBetween(date, endDate) : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { title, date: date || null, weeklyPlanId: planId || null };
    if (dates.length > 1) return submitMany(body);
    const ok = await run(() =>
      initial ? api(`/api/todos/${initial.id}`, "PATCH", { ...body, status }) : api("/api/todos", "POST", body),
    );
    if (!ok) return;
    if (!initial) setTitle("");
    onDone();
  }

  // ponytail: 날짜마다 POST 한 번씩. 한 번에 수백 건이 필요해지면 일괄 생성 API 추가
  async function submitMany(body: { title: string; weeklyPlanId: string | null }) {
    let created = 0;
    const ok = await run(async () => {
      if (dates.length > MAX_DAYS) throw new ApiError(`한 번에 최대 ${MAX_DAYS}일까지 추가할 수 있습니다`);
      const results = await Promise.allSettled(dates.map((d) => api("/api/todos", "POST", { ...body, date: d })));
      created = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) throw new ApiError(`${dates.length}일 중 ${dates.length - created}일을 추가하지 못했습니다. ${(failed.reason as Error).message}`);
    });
    if (ok) setTitle("");
    if (created > 0) onDone(); // 일부만 성공해도 만들어진 건 화면에 반영
  }

  const small = `${inputClass} py-1.5 text-sm`;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={initial ? "할 일 수정" : "할 일 추가"}>
      <div className="flex flex-wrap items-end gap-2">
        <label className={initial ? `${fieldLabelClass} min-w-0 flex-1 basis-48` : "relative flex min-w-0 flex-1 basis-48 flex-col"}>
          <span className={initial ? "" : "sr-only"}>제목</span>
          {!initial && (
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 hidden -translate-y-1/2 text-ok dev:inline">
              $ todo add
            </span>
          )}
          <input
            className={initial ? inputClass : `${inputClass} rounded-full px-5 py-3 text-base dev:pl-32`}
            placeholder={initial ? undefined : "무엇을 해야 하나요?"}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            {...fieldError(error, "title", `${id}-err`)}
          />
        </label>
        {!initial && (
          <button type="submit" className={`${primaryButtonClass} py-3`} disabled={pending}>
            {pending ? "추가 중…" : dates.length > 1 ? `+ ${dates.length}일에 추가` : "+ 추가"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className={fieldLabelClass}>
          {range && !initial ? "시작 날짜" : "날짜"}
          <input type="date" className={small} value={date} onChange={(e) => setDate(e.target.value)} {...fieldError(error, "date", `${id}-err`)} />
        </label>
        {range && !initial && (
          <label className={fieldLabelClass}>
            종료 날짜 (선택)
            <input type="date" className={small} value={endDate} min={date || undefined} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        )}
        {initial && (
          <label className={fieldLabelClass}>
            상태
            <select className={small} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={`${fieldLabelClass} min-w-0 max-w-full`}>
          주간 계획
          <select className={small} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">연결 안 함</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.weekStart} 주 · {p.title}
              </option>
            ))}
          </select>
        </label>
        {initial && (
          <div className="flex gap-2">
            <button type="submit" className={primaryButtonClass} disabled={pending}>
              {pending ? "저장 중…" : "저장"}
            </button>
            {onCancel && (
              <button type="button" className={buttonClass} onClick={onCancel}>
                취소
              </button>
            )}
          </div>
        )}
      </div>
      <FormError id={`${id}-err`} error={error} />
    </form>
  );
}
