"use client";

import { useId, useState } from "react";
import { api, fieldError, toMonday, useAction, useList, type WeeklyPlan, type YearGoal } from "@/lib/client";
import {
  AsyncState,
  buttonClass,
  cardClass,
  EditIcon,
  fieldLabelClass,
  FormError,
  headingClass,
  IconButton,
  inputClass,
  pageTitleClass,
  primaryButtonClass,
  ProgressRing,
  Themed,
  TrashIcon,
} from "@/components/ui";

export default function WeeklyPage() {
  const plans = useList<WeeklyPlan>("/api/weekly-plans");
  const goals = useList<YearGoal>("/api/year-goals");
  const [editingId, setEditingId] = useState<string | null>(null);
  const del = useAction();

  async function remove(plan: WeeklyPlan) {
    if (!confirm(`"${plan.title}" 계획을 삭제할까요? 연결된 할 일은 연결만 해제됩니다.`)) return;
    if (await del.run(() => api(`/api/weekly-plans/${plan.id}`, "DELETE"))) plans.reload();
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className={pageTitleClass}>
        <Themed colorful="🗓️ 주간 계획" dev="$ ls weekly/" />
      </h1>
      <section aria-labelledby="plan-add" className={`${cardClass} flex flex-col gap-3 p-5`}>
        <h2 id="plan-add" className={headingClass}>
          <Themed colorful="계획 추가" dev="// new plan" />
        </h2>
        {goals.error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            1년 목표 목록을 불러오지 못해 목표를 연결할 수 없습니다. {goals.error}
            <button type="button" className={buttonClass} onClick={goals.retry}>
              다시 시도
            </button>
          </div>
        )}
        <PlanForm goals={goals.data ?? []} onDone={plans.reload} />
      </section>
      <section aria-labelledby="plan-list" className="flex flex-col gap-3">
        <h2 id="plan-list" className={headingClass}>
          <Themed colorful="계획 목록" dev="// plans" />
        </h2>
        <FormError id="plan-del-err" error={del.error} />
        <AsyncState
          data={plans.data}
          error={plans.error}
          retry={plans.retry}
          empty={<Themed colorful="📝 주간 계획이 없습니다. 위에서 추가해 보세요." dev="# 주간 계획이 없습니다. 위에서 추가해 보세요." />}
        >
          {(list) => (
            <ul className="grid gap-3 md:grid-cols-2">
              {list.map((p) => (
                <li key={p.id} className={cardClass}>
                  {editingId === p.id ? (
                    <PlanForm
                      goals={goals.data ?? []}
                      initial={p}
                      onCancel={() => setEditingId(null)}
                      onDone={() => {
                        setEditingId(null);
                        plans.reload();
                      }}
                    />
                  ) : (
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                      <ProgressRing
                        value={p.progress}
                        size={72}
                        label={`${p.title} 진행률`}
                        detail={`${p.doneCount}/${p.todoCount}`}
                        className="dev:order-last dev:basis-full"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-semibold text-fg">{p.title}</p>
                        <p className="text-sm text-muted">
                          <Themed colorful={`${p.weekStart} 주 · ${p.doneCount}/${p.todoCount} 완료`} dev={`week ${p.weekStart}`} />
                        </p>
                        <p className="mt-1.5">
                          <span className="rounded-full bg-goal-soft px-2 py-0.5 text-xs font-medium text-goal-fg dev:bg-transparent dev:px-0">
                            <Themed colorful="🎯 " dev="goal: " />
                            {goals.data?.find((g) => g.id === p.yearGoalId)?.title ?? "목표 연결 안 됨"}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0">
                        <IconButton label={`"${p.title}" 수정`} onClick={() => setEditingId(p.id)}>
                          <EditIcon />
                        </IconButton>
                        <IconButton label={`"${p.title}" 삭제`} tone="danger" disabled={del.pending} onClick={() => remove(p)}>
                          <TrashIcon />
                        </IconButton>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </AsyncState>
      </section>
    </div>
  );
}

function PlanForm({
  goals,
  initial,
  onDone,
  onCancel,
}: {
  goals: YearGoal[];
  initial?: WeeklyPlan;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.weekStart ?? "");
  const [goalId, setGoalId] = useState(initial?.yearGoalId ?? "");
  const { pending, error, run } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { title, weekStart: toMonday(date), yearGoalId: goalId || null }; // 백엔드는 월요일만 허용
    const ok = await run(() => (initial ? api(`/api/weekly-plans/${initial.id}`, "PATCH", body) : api("/api/weekly-plans", "POST", body)));
    if (!ok) return;
    if (!initial) setTitle("");
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2" aria-label={initial ? "주간 계획 수정" : "주간 계획 추가"}>
      <label className={`${fieldLabelClass} min-w-0 flex-1 basis-48`}>
        제목
        <input className={inputClass} required value={title} onChange={(e) => setTitle(e.target.value)} {...fieldError(error, "title", `${id}-err`)} />
      </label>
      <label className={fieldLabelClass}>
        주 (아무 날짜나 선택)
        <input
          type="date"
          required
          className={inputClass}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-describedby={`${id}-week`}
          {...fieldError(error, "weekStart", `${id}-err`)}
        />
      </label>
      <label className={`${fieldLabelClass} min-w-0 max-w-full`}>
        1년 목표
        <select className={inputClass} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
          <option value="">연결 안 함</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.year}년 · {g.title}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={primaryButtonClass} disabled={pending}>
        {pending ? "저장 중…" : initial ? "저장" : "+ 추가"}
      </button>
      {onCancel && (
        <button type="button" className={buttonClass} onClick={onCancel}>
          취소
        </button>
      )}
      <p id={`${id}-week`} className="w-full text-xs text-muted">
        {date ? `${toMonday(date)}(월)부터 시작하는 주로 저장됩니다.` : "선택한 날짜가 속한 주의 월요일로 저장됩니다."}
      </p>
      <FormError id={`${id}-err`} error={error} />
    </form>
  );
}
