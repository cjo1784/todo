"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { api, STATUSES, today, toMonday, useAction, useList, type Status, type Todo, type WeeklyPlan } from "@/lib/client";
import {
  AsyncState,
  buttonClass,
  cardClass,
  EditIcon,
  fieldLabelClass,
  focusClass,
  FormError,
  headingClass,
  IconButton,
  inputClass,
  ProgressRing,
  Themed,
  TrashIcon,
} from "@/components/ui";
import TodoForm from "@/components/TodoForm";

const ORDER = STATUSES.map((s) => s.value);
const label = (id: unknown) => STATUSES.find((s) => s.value === id)?.label ?? "컬럼 밖";

// 컬럼별 톤 (테마 토큰 기반. Tailwind가 찾을 수 있게 전체 클래스 문자열로 둠)
const TONE: Record<Status, { column: string; over: string; title: string; badge: string }> = {
  todo: { column: "border-todo-line bg-todo-bg", over: "ring-todo-fg", title: "text-todo-fg", badge: "bg-todo-line text-todo-fg" },
  doing: { column: "border-doing-line bg-doing-bg", over: "ring-doing-fg", title: "text-doing-fg", badge: "bg-doing-line text-doing-fg" },
  done: { column: "border-done-line bg-done-bg", over: "ring-done-fg", title: "text-done-fg", badge: "bg-done-line text-done-fg" },
};

// 키보드 드래그: 방향키 한 번에 옆(또는 위아래) 컬럼으로 이동
const columnJump: KeyboardCoordinateGetter = (event, { context: { over, droppableRects, collisionRect } }) => {
  const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[event.code];
  if (!step || !collisionRect) return;
  event.preventDefault();
  const i = ORDER.indexOf(over?.id as Status);
  const rect = droppableRects.get(ORDER[Math.min(ORDER.length - 1, Math.max(0, i + step))]);
  if (!rect) return;
  return { x: rect.left + (rect.width - collisionRect.width) / 2, y: rect.top + 56 };
};

export default function TodoBoard({ date }: { date?: string }) {
  const router = useRouter();
  const filterId = useId();
  const todos = useList<Todo>(date ? `/api/todos?date=${encodeURIComponent(date)}` : "/api/todos");
  const plans = useList<WeeklyPlan>("/api/weekly-plans");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const del = useAction();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnJump }),
  );

  const refresh = () => {
    todos.reload();
    plans.reload(); // 진행률은 주간 계획 응답에만 있음
  };
  const titleOf = (id: unknown) => todos.data?.find((t) => t.id === id)?.title ?? "";

  async function onDragEnd({ active, over }: DragEndEvent) {
    const todo = todos.data?.find((t) => t.id === active.id);
    const status = over?.id as Status | undefined;
    if (!todo || !status || todo.status === status) return;
    const setStatus = (s: Status) => todos.setData((list) => list.map((t) => (t.id === todo.id ? { ...t, status: s } : t)));
    setDragError(null);
    setStatus(status); // 화면 먼저 반영
    try {
      await api(`/api/todos/${todo.id}`, "PATCH", { status });
      plans.reload();
    } catch (e) {
      setStatus(todo.status); // 원위치
      setDragError(`"${todo.title}" 상태를 저장하지 못해 원래 컬럼으로 되돌렸습니다. ${(e as Error).message}`);
    }
  }

  async function remove(todo: Todo) {
    if (!confirm(`"${todo.title}" 할 일을 삭제할까요?`)) return;
    if (await del.run(() => api(`/api/todos/${todo.id}`, "DELETE"))) refresh();
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `"${titleOf(active.id)}" 카드를 들었습니다.`,
    onDragOver: ({ active, over }) => `"${titleOf(active.id)}" 카드가 ${label(over?.id)} 컬럼 위에 있습니다.`,
    onDragEnd: ({ active, over }) => `"${titleOf(active.id)}" 카드를 ${label(over?.id)} 컬럼에 놓았습니다.`,
    onDragCancel: ({ active }) => `"${titleOf(active.id)}" 카드 이동을 취소했습니다.`,
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="week-heading" className="flex flex-col gap-3">
        <h2 id="week-heading" className={headingClass}>
          <Themed colorful="🎯 이번 주 진행률" dev="// this week" />
        </h2>
        <AsyncState
          data={plans.data?.filter((p) => p.weekStart === toMonday(today()))}
          error={plans.error}
          retry={plans.retry}
          empty={
            <>
              <Themed colorful="🗓️ 이번 주 주간 계획이 없습니다." dev="# 이번 주 주간 계획이 없습니다." />{" "}
              <Link href="/weekly" className={`font-semibold text-accent-strong underline underline-offset-2 ${focusClass}`}>
                주간 계획 만들기
              </Link>
            </>
          }
        >
          {(list) => (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <li key={p.id} className={`${cardClass} flex flex-wrap items-center gap-x-4 gap-y-2`}>
                  <ProgressRing
                    value={p.progress}
                    size={80}
                    label={`${p.title} 진행률`}
                    detail={`${p.doneCount}/${p.todoCount}`}
                    className="dev:order-last dev:basis-full"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-fg">{p.title}</p>
                    <p className="text-sm text-muted dev:hidden">
                      이번 주 {p.doneCount}/{p.todoCount} 완료
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AsyncState>
      </section>

      <section aria-labelledby="add-heading" className={`${cardClass} flex flex-col gap-3 p-5`}>
        <h2 id="add-heading" className={headingClass}>
          <Themed colorful="✏️ 할 일 추가" dev="// add todo" />
        </h2>
        <TodoForm key={date ?? ""} plans={plans.data ?? []} defaultDate={date} onDone={refresh} />
      </section>

      <section aria-labelledby="board-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <h2 id="board-heading" className={`${headingClass} mr-auto`}>
            <Themed
              colorful={
                <>
                  📋 칸반 보드 <span className="text-base font-medium text-muted">{date ?? "전체"}</span>
                </>
              }
              dev={`// board ${date ?? "--all"}`}
            />
          </h2>
          <label htmlFor={filterId} className={fieldLabelClass}>
            날짜 필터
            <input
              id={filterId}
              type="date"
              className={`${inputClass} py-1.5 text-sm`}
              value={date ?? ""}
              onChange={(e) => router.push(e.target.value ? `/?date=${e.target.value}` : "/")}
            />
          </label>
          <button type="button" className={buttonClass} disabled={!date} onClick={() => router.push("/")}>
            전체 보기
          </button>
        </div>

        <FormError id="drag-error" error={dragError ?? del.error} />

        <AsyncState
          data={todos.data}
          error={todos.error}
          retry={todos.retry}
          empty={
            date ? (
              <Themed colorful="🌤️ 이 날짜에 할 일이 없습니다." dev="# 이 날짜에 할 일이 없습니다." />
            ) : (
              <Themed colorful="🌱 할 일이 없습니다. 위에서 추가해 보세요." dev="# 할 일이 없습니다. $ todo add 로 추가해 보세요." />
            )
          }
        >
          {(list) => (
            <DndContext
              sensors={sensors}
              onDragEnd={onDragEnd}
              accessibility={{
                announcements,
                screenReaderInstructions: {
                  draggable: "스페이스나 엔터로 카드를 들고, 방향키로 컬럼을 옮긴 뒤 스페이스나 엔터로 놓습니다. ESC로 취소합니다.",
                },
              }}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {STATUSES.map((s) => {
                  const items = list.filter((t) => t.status === s.value);
                  return (
                    <Column key={s.value} status={s.value} label={s.label} count={items.length}>
                      {items.map((t) =>
                        editingId === t.id ? (
                          <li key={t.id} className={`${cardClass} p-3`}>
                            <TodoForm
                              plans={plans.data ?? []}
                              initial={t}
                              onCancel={() => setEditingId(null)}
                              onDone={() => {
                                setEditingId(null);
                                refresh();
                              }}
                            />
                          </li>
                        ) : (
                          <TodoCard
                            key={t.id}
                            todo={t}
                            planTitle={plans.data?.find((p) => p.id === t.weeklyPlanId)?.title}
                            busy={del.pending}
                            onEdit={() => setEditingId(t.id)}
                            onDelete={() => remove(t)}
                          />
                        ),
                      )}
                    </Column>
                  );
                })}
              </div>
            </DndContext>
          )}
        </AsyncState>
      </section>
    </div>
  );
}

function Column({ status, label, count, children }: { status: Status; label: string; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const tone = TONE[status];
  return (
    <section
      ref={setNodeRef}
      aria-label={`${label} (${count})`}
      className={`flex min-h-48 flex-col gap-3 rounded-3xl border p-4 transition ${tone.column} ${isOver ? `ring-2 ${tone.over}` : ""}`}
    >
      <h3 className={`font-bold ${tone.title}`}>
        <Themed
          colorful={
            <span className="inline-flex items-center gap-2">
              {label}
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone.badge}`}>{count}</span>
            </span>
          }
          dev={`${status.toUpperCase()} (${count})`}
        />
      </h3>
      <ul className="flex flex-col gap-3">{children}</ul>
    </section>
  );
}

function TodoCard({
  todo,
  planTitle,
  busy,
  onEdit,
  onDelete,
}: {
  todo: Todo;
  planTitle?: string;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: todo.id });
  return (
    <li
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`flex items-start gap-2 rounded-2xl border border-card-line bg-surface p-3 shadow-sm shadow-black/10 transition-shadow hover:shadow-md dev:shadow-none dev:hover:border-muted ${
        isDragging ? "relative z-10 shadow-xl ring-2 ring-accent" : ""
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        type="button"
        aria-label={`"${todo.title}" 이동`}
        className={`grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-full text-muted hover:bg-surface-2 ${focusClass}`}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
          {[5, 12, 19].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
        </svg>
      </button>
      <div className="min-w-0 flex-1 pt-1">
        <p className="break-words font-semibold text-fg dev:font-normal">
          {/* 개발자 테마: ObjectId 앞자리는 생성 시각이라 카드끼리 같아서, 구분되는 뒤 3자리를 짧은 id로 표시 */}
          <span className="mr-2 hidden text-muted dev:inline">#{todo.id.slice(-3)}</span>
          {todo.title}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs dev:gap-3">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted dev:bg-transparent dev:px-0">
            <Themed colorful={todo.date ?? "날짜 없음"} dev={todo.date?.slice(5) ?? "--"} />
          </span>
          {planTitle && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent-strong dev:bg-transparent dev:px-0">
              <span className="hidden dev:inline">@</span>
              {planTitle}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0">
        <IconButton label={`"${todo.title}" 수정`} onClick={onEdit}>
          <EditIcon />
        </IconButton>
        <IconButton label={`"${todo.title}" 삭제`} tone="danger" disabled={busy} onClick={onDelete}>
          <TrashIcon />
        </IconButton>
      </div>
    </li>
  );
}
