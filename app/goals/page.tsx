"use client";

import { useId, useState } from "react";
import { api, fieldError, useAction, useList, type YearGoal } from "@/lib/client";
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
  Themed,
  TrashIcon,
} from "@/components/ui";

export default function GoalsPage() {
  const goals = useList<YearGoal>("/api/year-goals");
  const [editingId, setEditingId] = useState<string | null>(null);
  const del = useAction();

  async function remove(goal: YearGoal) {
    if (!confirm(`"${goal.title}" 목표를 삭제할까요? 연결된 주간 계획은 연결만 해제됩니다.`)) return;
    if (await del.run(() => api(`/api/year-goals/${goal.id}`, "DELETE"))) goals.reload();
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className={pageTitleClass}>
        <Themed colorful="🏔️ 1년 목표" dev="$ ls goals/" />
      </h1>
      <section aria-labelledby="goal-add" className={`${cardClass} flex flex-col gap-3 p-5`}>
        <h2 id="goal-add" className={headingClass}>
          <Themed colorful="목표 추가" dev="// new goal" />
        </h2>
        <GoalForm onDone={goals.reload} />
      </section>
      <section aria-labelledby="goal-list" className="flex flex-col gap-3">
        <h2 id="goal-list" className={headingClass}>
          <Themed colorful="목표 목록" dev="// goals" />
        </h2>
        <FormError id="goal-del-err" error={del.error} />
        <AsyncState
          data={goals.data}
          error={goals.error}
          retry={goals.retry}
          empty={<Themed colorful="🌟 1년 목표가 없습니다. 위에서 추가해 보세요." dev="# 1년 목표가 없습니다. 위에서 추가해 보세요." />}
        >
          {(list) => (
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((g) => (
                <li key={g.id} className={`${cardClass} border-l-4 border-l-goal-line dev:border-l-2`}>
                  {editingId === g.id ? (
                    <GoalForm
                      initial={g}
                      onCancel={() => setEditingId(null)}
                      onDone={() => {
                        setEditingId(null);
                        goals.reload();
                      }}
                    />
                  ) : (
                    <div className="flex items-start gap-3">
                      <span className="rounded-full bg-goal-soft px-3 py-1 text-sm font-bold text-goal-fg dev:bg-transparent dev:px-0 dev:py-0.5">
                        <Themed colorful={g.year} dev={`${g.year}:`} />
                      </span>
                      <p className="min-w-0 flex-1 break-words pt-0.5 font-semibold text-fg dev:font-normal">{g.title}</p>
                      <div className="flex shrink-0">
                        <IconButton label={`"${g.title}" 수정`} onClick={() => setEditingId(g.id)}>
                          <EditIcon />
                        </IconButton>
                        <IconButton label={`"${g.title}" 삭제`} tone="danger" disabled={del.pending} onClick={() => remove(g)}>
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

function GoalForm({ initial, onDone, onCancel }: { initial?: YearGoal; onDone: () => void; onCancel?: () => void }) {
  const id = useId();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [year, setYear] = useState(String(initial?.year ?? new Date().getFullYear()));
  const { pending, error, run } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { title, year: Number(year) };
    const ok = await run(() => (initial ? api(`/api/year-goals/${initial.id}`, "PATCH", body) : api("/api/year-goals", "POST", body)));
    if (!ok) return;
    if (!initial) setTitle("");
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2" aria-label={initial ? "목표 수정" : "목표 추가"}>
      <label className={`${fieldLabelClass} min-w-0 flex-1 basis-48`}>
        제목
        <input className={inputClass} required value={title} onChange={(e) => setTitle(e.target.value)} {...fieldError(error, "title", `${id}-err`)} />
      </label>
      <label className={fieldLabelClass}>
        연도
        <input
          type="number"
          step={1}
          required
          className={`${inputClass} w-28`}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          {...fieldError(error, "year", `${id}-err`)}
        />
      </label>
      <button type="submit" className={primaryButtonClass} disabled={pending}>
        {pending ? "저장 중…" : initial ? "저장" : "+ 추가"}
      </button>
      {onCancel && (
        <button type="button" className={buttonClass} onClick={onCancel}>
          취소
        </button>
      )}
      <FormError id={`${id}-err`} error={error} />
    </form>
  );
}
