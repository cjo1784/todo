import type { ReactNode } from "react";
import type { ApiError } from "@/lib/client";

// 색은 app/globals.css의 테마 토큰(시맨틱 클래스)만 사용 → 컬러풀/개발자 테마가 같이 따라감
export const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const inputClass = `rounded-xl border border-line bg-surface px-3 py-2 text-fg shadow-sm placeholder:text-muted dev:shadow-none ${focusClass}`;
export const buttonClass = `rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-fg shadow-sm transition hover:bg-surface-2 disabled:opacity-50 dev:shadow-none ${focusClass}`;
export const primaryButtonClass = `rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-fg shadow-md shadow-accent/25 transition hover:bg-accent-hover disabled:opacity-50 dev:shadow-none ${focusClass}`;
export const cardClass = "rounded-2xl border border-card-line bg-surface p-4 shadow-sm shadow-black/5 dev:shadow-none";
export const headingClass = "text-lg font-bold text-fg dev:text-base dev:font-normal dev:text-muted";
export const pageTitleClass = "text-3xl font-extrabold tracking-tight text-fg dev:text-xl dev:font-bold";
export const fieldLabelClass = "flex flex-col gap-1 text-xs font-medium text-muted";

// 테마별로 글자/구조만 다를 때: 보이지 않는 쪽은 display:none이라 스크린리더도 읽지 않음
export function Themed({ colorful, dev }: { colorful: ReactNode; dev: ReactNode }) {
  return (
    <>
      <span className="dev:hidden">{colorful}</span>
      <span className="hidden dev:inline">{dev}</span>
    </>
  );
}

// 목록 4상태: 오류(재시도) / 로딩 / 비어 있음 / 정상
export function AsyncState<T>({
  data,
  error,
  retry,
  empty,
  children,
}: {
  data?: T[];
  error?: string;
  retry: () => void;
  empty: ReactNode;
  children: (data: T[]) => ReactNode;
}) {
  if (error)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/40 bg-danger-soft p-4 text-danger">
        <p>
          <span className="hidden dev:inline">error: </span>불러오지 못했습니다. {error}
        </p>
        <button type="button" className={buttonClass} onClick={retry}>
          다시 시도
        </button>
      </div>
    );
  if (!data)
    return (
      <p role="status" className="rounded-2xl bg-surface/60 p-4 text-muted">
        불러오는 중…
      </p>
    );
  if (data.length === 0)
    return <p className="rounded-2xl border-2 border-dashed border-line bg-surface/60 p-6 text-center text-fg dev:border dev:text-left">{empty}</p>;
  return children(data);
}

export function FormError({ id, error }: { id: string; error: ApiError | string | null }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="w-full rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
      {typeof error === "string" ? error : error.message}
    </p>
  );
}

// 컬러풀: 원형 링 / 개발자: [████░░░░] 텍스트 바. 접근성 정보는 바깥 progressbar 하나로 통일
export function ProgressRing({
  value,
  label,
  detail,
  size = 64,
  className = "",
}: {
  value: number;
  label: string;
  detail?: string;
  size?: number;
  className?: string;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const cells = Math.round((value / 100) * 12);
  const done = value === 100;
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label} className={`shrink-0 ${className}`}>
      <div className="relative grid place-items-center dev:hidden" style={{ width: size, height: size }}>
        <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r={r} fill="none" strokeWidth="8" className="stroke-accent-soft" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value / 100)}
            className={`transition-[stroke-dashoffset] duration-500 ${done ? "stroke-ok" : "stroke-accent"}`}
          />
        </svg>
        <span className="text-sm font-bold text-fg">{value}%</span>
      </div>
      <span aria-hidden="true" className="hidden whitespace-pre text-sm text-fg dev:inline">
        [<span className={done ? "text-ok" : "text-accent-strong"}>{"█".repeat(cells)}</span>
        <span className="text-muted">{"░".repeat(12 - cells)}</span>] {String(value).padStart(3)}%{detail ? `  ${detail}` : ""}
      </span>
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  disabled,
  tone = "neutral",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
  children: ReactNode;
}) {
  const color = tone === "danger" ? "text-danger hover:bg-danger-soft" : "text-muted hover:bg-surface-2 hover:text-fg";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid size-8 place-items-center rounded-full transition disabled:opacity-50 ${color} ${focusClass}`}
    >
      {children}
    </button>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "size-4",
  "aria-hidden": true,
} as const;

export const EditIcon = () => (
  <svg {...iconProps}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...iconProps}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
  </svg>
);
