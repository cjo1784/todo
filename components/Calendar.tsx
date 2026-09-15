"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { api, today, useList, type Status, type Todo, type WeeklyPlan } from "@/lib/client";
import { datesBetween, dayLabel, monthDays, periodLabel, sameMonth, shiftDate, WEEKDAY_HEADERS, weekDays, type CalendarView } from "@/lib/calendar";
import {
  AsyncState,
  buttonClass,
  focusClass,
  FormError,
  headingClass,
  pageTitleClass,
  primaryButtonClass,
  ProgressRing,
  Themed,
} from "@/components/ui";
import { TONE } from "@/components/TodoBoard";
import CalendarDialog, { DayPanel, statusLabel, TodoDetail } from "@/components/CalendarDialog";

const UNDATED = "undated"; // 날짜 없는 목록의 droppable id (날짜 칸 id = "YYYY-MM-DD")
const DOT: Record<Status, string> = { todo: "bg-todo-fg", doing: "bg-doing-fg", done: "bg-done-fg" };
const where = (id?: UniqueIdentifier) => (id === UNDATED ? "날짜 없는 목록" : id ? dayLabel(String(id)) : "캘린더 밖");
const href = (view: CalendarView, date: string) => `/calendar?view=${view}&date=${date}`;

// 키보드 드래그: 방향키 쪽으로 가장 가까운 칸(또는 날짜 없는 목록) 가운데로 이동
const nearestCell: KeyboardCoordinateGetter = (event, { context: { droppableRects, collisionRect } }) => {
  const dir = ({ ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] } as Record<string, [number, number]>)[event.code];
  if (!dir || !collisionRect) return;
  event.preventDefault();
  const cx = collisionRect.left + collisionRect.width / 2;
  const cy = collisionRect.top + collisionRect.height / 2;
  let best: ClientRect | undefined;
  let bestScore = Infinity;
  for (const rect of droppableRects.values()) {
    const dx = rect.left + rect.width / 2 - cx;
    const dy = rect.top + rect.height / 2 - cy;
    const along = dx * dir[0] + dy * dir[1];
    if (along < 1) continue;
    const score = along + 2 * Math.abs(dx * dir[1] + dy * dir[0]); // 진행 방향에서 벗어난 칸은 불리하게
    if (score < bestScore) [best, bestScore] = [rect, score];
  }
  if (!best) return;
  return { x: best.left + (best.width - collisionRect.width) / 2, y: best.top + (best.height - collisionRect.height) / 2 };
};

// 포인터: 커서가 놓인 칸 (넓은 할 일을 손잡이로 잡으면 겹친 면적 기준으로는 옆 칸이 잡힘). 키보드: 좌표가 없어 겹친 면적 기준
const dropTarget: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

type Dialog = { kind: "day"; date: string; end?: string } | { kind: "todo"; id: string } | null;

// 칸의 빈 곳(버튼·링크 제외)이 가리키는 날짜
const cellDate = (el: EventTarget | null) =>
  el instanceof Element && !el.closest("button,a") ? el.closest<HTMLElement>("[data-date]")?.dataset.date : undefined;

export default function Calendar({ view, date }: { view: CalendarView; date?: string }) {
  const base = date ?? today();
  // ponytail: 본인 할 일 전체를 받아 클라이언트에서 날짜별로 묶음. 수천 건 이상이면 기간 조회 API(?from=&to=) 추가
  const todos = useList<Todo>("/api/todos");
  const plans = useList<WeeklyPlan>("/api/weekly-plans");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [sel, setSel] = useState<{ from: string; to: string } | null>(null);
  const justSelected = useRef(false); // 여러 날짜 선택을 시작 칸에서 끝내면 뒤따르는 click을 무시
  const [selFrom, selTo] = sel ? [sel.from, sel.to].sort() : [];

  // 마우스로 빈 칸을 누른 채 끌어 여러 날짜 선택 → 놓으면 기간 추가 창. 한 칸 클릭은 DayCell onClick
  // ponytail: 터치는 스크롤과 겹쳐 끌기 선택 제외. 대신 추가 창의 종료 날짜 입력 사용
  function startSelect(e: React.PointerEvent) {
    justSelected.current = false;
    const d = e.button === 0 && e.pointerType !== "touch" ? cellDate(e.target) : undefined;
    if (!d) return;
    e.preventDefault(); // 끄는 동안 글자 선택 방지
    setSel({ from: d, to: d });
  }
  function extendSelect(e: React.PointerEvent) {
    const d = sel && document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-date]")?.dataset.date;
    if (sel && d && d !== sel.to) setSel({ ...sel, to: d });
  }
  useEffect(() => {
    if (!sel) return;
    const finish = () => {
      if (sel.from !== sel.to) {
        justSelected.current = true;
        const [date, end] = [sel.from, sel.to].sort();
        setDialog({ kind: "day", date, end });
      }
      setSel(null);
    };
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
  }, [sel]);
  function openDay(e: React.MouseEvent, date: string) {
    if (justSelected.current) return void (justSelected.current = false);
    if (cellDate(e.target)) setDialog({ kind: "day", date });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: nearestCell }),
  );

  const list = todos.data ?? [];
  const byDate = new Map<string, Todo[]>();
  const undated: Todo[] = [];
  for (const t of list) {
    if (t.date) byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
    else undated.push(t);
  }
  const days = view === "month" ? monthDays(base) : weekDays(base);
  const titleOf = (id: UniqueIdentifier) => list.find((t) => t.id === id)?.title ?? "";
  const active = list.find((t) => t.id === activeId);
  const dialogTodo = dialog?.kind === "todo" ? list.find((t) => t.id === dialog.id) : undefined;
  const step = view === "month" ? "달" : "주";

  const refresh = () => {
    todos.reload();
    plans.reload(); // 진행률은 주간 계획 응답에만 있음
  };

  async function move(todo: Todo, to: string | null) {
    if (todo.date === to) return;
    const setDate = (d: string | null) => todos.setData((l) => l.map((t) => (t.id === todo.id ? { ...t, date: d } : t)));
    setDate(to); // 화면 먼저 반영
    try {
      await api(`/api/todos/${todo.id}`, "PATCH", { date: to });
      plans.reload();
    } catch (e) {
      setDate(todo.date); // 원위치
      setDragError(`"${todo.title}" 날짜를 저장하지 못해 원래 자리로 되돌렸습니다. ${(e as Error).message}`);
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const todo = list.find((t) => t.id === active.id);
    if (todo && over) void move(todo, over.id === UNDATED ? null : String(over.id));
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `"${titleOf(active.id)}" 할 일을 들었습니다.`,
    onDragOver: ({ active, over }) => `"${titleOf(active.id)}" 할 일이 ${where(over?.id)} 위에 있습니다.`,
    onDragEnd: ({ active, over }) => `"${titleOf(active.id)}" 할 일을 ${where(over?.id)}에 놓았습니다.`,
    onDragCancel: ({ active }) => `"${titleOf(active.id)}" 할 일 이동을 취소했습니다.`,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className={pageTitleClass}>
          <Themed colorful="📅 캘린더" dev="$ cal" />
        </h1>
        <p aria-live="polite" className="text-lg font-bold text-fg dev:text-base dev:font-normal dev:text-accent-strong">
          {periodLabel(view, base)}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <nav aria-label="기간 이동" className="flex gap-1">
            <Link href={href(view, shiftDate(view, base, -1))} aria-label={`이전 ${step}`} className={buttonClass}>
              ‹
            </Link>
            <Link href={href(view, today())} className={buttonClass}>
              오늘
            </Link>
            <Link href={href(view, shiftDate(view, base, 1))} aria-label={`다음 ${step}`} className={buttonClass}>
              ›
            </Link>
          </nav>
          <div role="group" aria-label="보기 전환" className="flex gap-1">
            {(["month", "week"] as const).map((v) => (
              <Link key={v} href={href(v, base)} aria-current={view === v ? "true" : undefined} className={view === v ? primaryButtonClass : buttonClass}>
                <Themed colorful={v === "month" ? "월간" : "주간"} dev={`--${v}`} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {view === "week" && (
        <section aria-labelledby="week-plans-heading" className="flex flex-col gap-3">
          <h2 id="week-plans-heading" className={headingClass}>
            <Themed colorful="🎯 이 주의 주간 계획" dev="// week plans" />
          </h2>
          <AsyncState
            data={plans.data?.filter((p) => p.weekStart === days[0])}
            error={plans.error}
            retry={plans.retry}
            empty={
              <>
                <Themed colorful="🗓️ 이 주에 주간 계획이 없습니다." dev="# 이 주에 주간 계획이 없습니다." />{" "}
                <Link href="/weekly" className={`font-semibold text-accent-strong underline underline-offset-2 ${focusClass}`}>
                  주간 계획 만들기
                </Link>
              </>
            }
          >
            {(weekPlans) => (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {weekPlans.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-card-line bg-surface p-3 shadow-sm shadow-black/5 dev:shadow-none"
                  >
                    <ProgressRing value={p.progress} size={56} label={`${p.title} 진행률`} detail={`${p.doneCount}/${p.todoCount}`} className="dev:order-last dev:basis-full" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-fg">{p.title}</p>
                      <p className="text-sm text-muted dev:hidden">
                        {p.doneCount}/{p.todoCount} 완료
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AsyncState>
        </section>
      )}

      <FormError id="calendar-error" error={dragError} />

      {/* 목록 1개로 감싸 AsyncState의 오류/로딩만 사용. 할 일 0개여도 캘린더는 보여야 함(빈 상태는 안내 문구) */}
      <AsyncState data={todos.data && [todos.data]} error={todos.error} retry={todos.retry} empty={null}>
        {() => (
          <DndContext
            sensors={sensors}
            collisionDetection={dropTarget}
            onDragStart={({ active }) => {
              setActiveId(active.id);
              setDragError(null);
            }}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={onDragEnd}
            accessibility={{
              announcements,
              screenReaderInstructions: {
                draggable: "스페이스나 엔터로 할 일을 들고, 방향키로 날짜 칸을 옮긴 뒤 스페이스나 엔터로 놓습니다. ESC로 취소합니다.",
              },
            }}
          >
            {list.length === 0 && (
              <p className="mb-4 rounded-2xl border-2 border-dashed border-line bg-surface/60 p-4 text-center text-fg dev:border dev:text-left">
                <Themed colorful="🌱 할 일이 없습니다. 날짜 칸을 눌러 추가해 보세요." dev="# 할 일이 없습니다. 날짜 칸을 눌러 추가해 보세요." />
              </p>
            )}
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
              <section aria-label={`${periodLabel(view, base)} ${view === "month" ? "월간" : "주간"} 캘린더`} className="min-w-0">
                {view === "month" && (
                  <div aria-hidden="true" className="mb-1 grid grid-cols-7 text-center text-xs font-semibold text-muted">
                    {WEEKDAY_HEADERS.map((w) => (
                      <span key={w}>{w}</span>
                    ))}
                  </div>
                )}
                <ol
                  onPointerDown={startSelect}
                  onPointerMove={extendSelect}
                  className={
                    view === "month" ? "grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-line bg-line" : "grid gap-2 lg:grid-cols-7"
                  }
                >
                  {days.map((d) => (
                    <DayCell
                      key={d}
                      date={d}
                      view={view}
                      todos={byDate.get(d) ?? []}
                      outside={view === "month" && !sameMonth(d, base)}
                      selected={!!sel && d >= selFrom && d <= selTo}
                      onAdd={() => setDialog({ kind: "day", date: d })}
                      onCellClick={(e) => openDay(e, d)}
                      onOpen={(id) => setDialog({ kind: "todo", id })}
                    />
                  ))}
                </ol>
                <p className="mt-2 text-xs text-muted">
                  <Themed
                    colorful="날짜 칸을 누르면 할 일 추가 · 여러 날짜를 끌어 선택하면 날마다 하나씩 추가"
                    dev="# click: add · drag across days: add one per day"
                  />
                </p>
              </section>
              <Undated todos={undated} onOpen={(id) => setDialog({ kind: "todo", id })} />
            </div>
            <DragOverlay dropAnimation={null}>
              {active && (
                <div className={`rounded-lg border px-2 py-1 text-xs font-medium shadow-lg ${TONE[active.status].column} ${TONE[active.status].title}`}>
                  {active.title}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </AsyncState>

      {dialog?.kind === "day" && (
        <CalendarDialog
          key={`day-${dialog.date}-${dialog.end ?? ""}`}
          title={dialog.end ? `${dayLabel(dialog.date)} ~ ${dayLabel(dialog.end)} (${datesBetween(dialog.date, dialog.end).length}일)` : dayLabel(dialog.date)}
          onClose={() => setDialog(null)}
        >
          <DayPanel
            date={dialog.date}
            end={dialog.end}
            todos={byDate.get(dialog.date) ?? []}
            plans={plans.data ?? []}
            onOpen={(id) => setDialog({ kind: "todo", id })}
            onAdded={refresh}
          />
        </CalendarDialog>
      )}
      {dialogTodo && (
        <CalendarDialog key={`todo-${dialogTodo.id}`} title={dialogTodo.title} onClose={() => setDialog(null)}>
          <TodoDetail
            todo={dialogTodo}
            plans={plans.data ?? []}
            onChanged={refresh}
            onDeleted={() => {
              setDialog(null);
              refresh();
            }}
          />
        </CalendarDialog>
      )}
    </div>
  );
}

function DayCell({
  date,
  view,
  todos,
  outside,
  selected,
  onAdd,
  onCellClick,
  onOpen,
}: {
  date: string;
  view: CalendarView;
  todos: Todo[];
  outside: boolean;
  selected: boolean;
  onAdd: () => void;
  onCellClick: (e: React.MouseEvent) => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  const month = view === "month";
  const isToday = date === today();
  const more = month ? todos.length - 3 : 0;
  const bg = selected ? "bg-accent-soft" : month && outside ? "bg-surface-2" : "bg-surface";
  return (
    // 칸 빈 곳 클릭 = 추가 창 (키보드는 아래 날짜 버튼)
    <li
      ref={setNodeRef}
      data-date={date}
      onClick={onCellClick}
      className={`flex min-w-0 cursor-pointer flex-col gap-1 transition ${bg} ${
        month
          ? "min-h-16 p-1 sm:min-h-28 sm:p-1.5"
          : "min-h-24 rounded-2xl border border-card-line p-2 shadow-sm shadow-black/5 lg:min-h-64 dev:shadow-none"
      } ${isOver || selected ? "ring-2 ring-accent ring-inset" : ""}`}
    >
      {/* 날짜 칸 = 이 버튼: 그 날짜의 목록 + 추가 폼 열기 */}
      <button
        type="button"
        onClick={onAdd}
        aria-label={`${dayLabel(date)}, 할 일 ${todos.length}개`}
        aria-current={isToday ? "date" : undefined}
        className={`self-start rounded-full px-1.5 text-sm font-semibold hover:underline ${focusClass} ${
          isToday ? "bg-accent text-accent-fg" : outside ? "text-muted" : "text-fg"
        }`}
      >
        {/* 주간: 좁은 7열에서 줄바꿈되지 않게 "9월 14일 월" (전체 이름은 aria-label) */}
        {month ? Number(date.slice(8)) : dayLabel(date).slice(0, -2)}
      </button>
      {month && todos.length > 0 && (
        // 모바일 월간: 칸이 좁아 상태 점과 개수만. 날짜를 누르면 목록이 열림
        <span aria-hidden="true" className="flex flex-wrap items-center gap-0.5 px-1 sm:hidden">
          {todos.slice(0, 3).map((t) => (
            <span key={t.id} className={`size-1.5 rounded-full ${DOT[t.status]}`} />
          ))}
          {more > 0 && <span className="text-[10px] leading-none text-muted">+{more}</span>}
        </span>
      )}
      <ul className={`flex-col gap-1 ${month ? "hidden sm:flex" : "flex"}`}>
        {(month ? todos.slice(0, 3) : todos).map((t) => (
          <TodoChip key={t.id} todo={t} onOpen={() => onOpen(t.id)} />
        ))}
      </ul>
      {more > 0 && (
        <button type="button" onClick={onAdd} className={`hidden self-start px-1 text-xs text-muted hover:text-fg sm:block ${focusClass}`}>
          +{more}개 더
        </button>
      )}
    </li>
  );
}

function TodoChip({ todo, onOpen }: { todo: Todo; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: todo.id });
  const tone = TONE[todo.status];
  return (
    <li ref={setNodeRef} className={`flex min-w-0 items-center rounded-lg border text-xs ${tone.column} ${tone.title} ${isDragging ? "opacity-40" : ""}`}>
      {/* 끌기 손잡이와 열기 버튼 분리: 키보드 스페이스/엔터가 드래그 시작과 겹치지 않게 */}
      <button
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        type="button"
        aria-label={`"${todo.title}" 이동`}
        className={`grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded-l-lg ${focusClass}`}
      >
        <svg viewBox="0 0 8 16" className="h-3 w-2" fill="currentColor" aria-hidden="true">
          {[3, 8, 13].flatMap((y) => [2, 6].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" />))}
        </svg>
      </button>
      <button
        type="button"
        onClick={onOpen}
        className={`min-w-0 flex-1 truncate py-1 pr-1.5 text-left ${todo.status === "done" ? "line-through" : ""} ${focusClass}`}
      >
        <span className="hidden dev:inline">#{todo.id.slice(-3)} </span>
        {todo.title}
        <span className="sr-only"> ({statusLabel(todo.status)})</span>
      </button>
    </li>
  );
}

function Undated({ todos, onOpen }: { todos: Todo[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: UNDATED });
  return (
    <section
      ref={setNodeRef}
      aria-labelledby="undated-heading"
      className={`flex min-h-32 flex-col gap-3 rounded-2xl border-2 border-dashed border-line bg-surface/60 p-3 transition dev:border ${isOver ? "ring-2 ring-accent" : ""}`}
    >
      <h2 id="undated-heading" className={headingClass}>
        <Themed colorful={`📥 날짜 없는 할 일 (${todos.length})`} dev={`// no date (${todos.length})`} />
      </h2>
      {todos.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {todos.map((t) => (
            <TodoChip key={t.id} todo={t} onOpen={() => onOpen(t.id)} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          <Themed colorful="없습니다. 캘린더의 할 일을 여기로 끌면 날짜가 지워집니다." dev="# empty — 여기로 끌면 date=null" />
        </p>
      )}
    </section>
  );
}
