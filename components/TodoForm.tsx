"use client";

import { useId, useState } from "react";
import { api, fieldError, STATUSES, useAction, type Status, type Todo, type WeeklyPlan } from "@/lib/client";
import { buttonClass, fieldLabelClass, FormError, inputClass, primaryButtonClass } from "@/components/ui";

// initial 있으면 수정(PATCH), 없으면 생성(POST)
export default function TodoForm({
  plans,
  initial,
  defaultDate = "",
  onDone,
  onCancel,
}: {
  plans: WeeklyPlan[];
  initial?: Todo;
  defaultDate?: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial ? (initial.date ?? "") : defaultDate);
  const [status, setStatus] = useState<Status>(initial?.status ?? "todo");
  const [planId, setPlanId] = useState(initial?.weeklyPlanId ?? "");
  const { pending, error, run } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { title, date: date || null, weeklyPlanId: planId || null };
    const ok = await run(() =>
      initial ? api(`/api/todos/${initial.id}`, "PATCH", { ...body, status }) : api("/api/todos", "POST", body),
    );
    if (!ok) return;
    if (!initial) setTitle("");
    onDone();
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
            {pending ? "추가 중…" : "+ 추가"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className={fieldLabelClass}>
          날짜
          <input type="date" className={small} value={date} onChange={(e) => setDate(e.target.value)} {...fieldError(error, "date", `${id}-err`)} />
        </label>
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
