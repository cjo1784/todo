"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api, STATUSES, useAction, type Status, type Todo, type WeeklyPlan } from "@/lib/client";
import { buttonClass, focusClass, FormError, IconButton, Themed } from "@/components/ui";
import { TONE } from "@/components/TodoBoard";
import TodoForm from "@/components/TodoForm";

export const statusLabel = (s: Status) => STATUSES.find((x) => x.value === s)?.label ?? s;

// 네이티브 <dialog>.showModal(): 포커스 이동·가두기, ESC 닫기, 닫은 뒤 이전 포커스 복귀를 브라우저가 처리
export default function CalendarDialog({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal(); // StrictMode 이중 실행에도 한 번만 열림
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto max-h-[85dvh] w-[min(32rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-card-line bg-surface p-5 text-fg shadow-xl backdrop:bg-black/50 dev:shadow-none"
    >
      <div className="mb-4 flex items-start gap-2">
        <h2 id={titleId} className="min-w-0 flex-1 break-words text-lg font-bold dev:text-base">
          {title}
        </h2>
        <IconButton label="닫기" onClick={() => ref.current?.close()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-4" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}

// 날짜 칸 클릭: 그 날짜의 할 일 목록 + 날짜가 채워진 추가 폼
export function DayPanel({
  date,
  todos,
  plans,
  onOpen,
  onAdded,
}: {
  date: string;
  todos: Todo[];
  plans: WeeklyPlan[];
  onOpen: (id: string) => void;
  onAdded: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {todos.length > 0 ? (
        <ul aria-label="이 날짜의 할 일" className="flex flex-col gap-1.5">
          {todos.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onOpen(t.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm ${TONE[t.status].column} ${TONE[t.status].title} ${focusClass}`}
              >
                <span className="min-w-0 break-words">{t.title}</span>
                <span className="shrink-0 text-xs">
                  <Themed colorful={statusLabel(t.status)} dev={t.status} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          <Themed colorful="이 날짜에 할 일이 없습니다." dev="# 이 날짜에 할 일이 없습니다." />
        </p>
      )}
      <TodoForm plans={plans} defaultDate={date} onDone={onAdded} />
    </div>
  );
}

// 할 일 클릭: 상태 변경 / 수정(TodoForm) / 삭제
export function TodoDetail({
  todo,
  plans,
  onChanged,
  onDeleted,
}: {
  todo: Todo;
  plans: WeeklyPlan[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const { error, run } = useAction();
  const errorId = useId();
  const planTitle = plans.find((p) => p.id === todo.weeklyPlanId)?.title;

  async function setStatus(status: Status) {
    if (status !== todo.status && (await run(() => api(`/api/todos/${todo.id}`, "PATCH", { status })))) onChanged();
  }
  async function remove() {
    if (!confirm(`"${todo.title}" 할 일을 삭제할까요?`)) return;
    if (await run(() => api(`/api/todos/${todo.id}`, "DELETE"))) onDeleted();
  }

  if (editing)
    return (
      <TodoForm
        plans={plans}
        initial={todo}
        onCancel={() => setEditing(false)}
        onDone={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">날짜</dt>
        <dd>{todo.date ?? "날짜 없음"}</dd>
        <dt className="text-muted">주간 계획</dt>
        <dd className="break-words">{planTitle ?? "연결 안 함"}</dd>
      </dl>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted">상태</legend>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => {
            const on = todo.status === s.value;
            const tone = TONE[s.value];
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={on}
                onClick={() => setStatus(s.value)}
                className={
                  on ? `rounded-full border px-4 py-2 text-sm font-semibold ring-2 ${tone.column} ${tone.title} ${tone.over} ${focusClass}` : buttonClass
                }
              >
                <Themed colorful={s.label} dev={s.value} />
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="text-xs text-muted">날짜를 옮기려면 캘린더에서 끌어 놓거나, 수정에서 날짜를 바꾸세요.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} onClick={() => setEditing(true)}>
          수정
        </button>
        <button
          type="button"
          onClick={remove}
          className={`rounded-full border border-danger/40 bg-surface px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger-soft ${focusClass}`}
        >
          삭제
        </button>
      </div>
      <FormError id={errorId} error={error} />
    </div>
  );
}
