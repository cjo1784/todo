// 클라이언트 전용: API 계약 타입, fetch 래퍼, 목록/액션 훅, 날짜 유틸 (artifacts/02-backend-report.md 기준)
import { useCallback, useEffect, useState } from "react";

export type Status = "todo" | "doing" | "done";
export type Todo = { id: string; title: string; date: string | null; status: Status; weeklyPlanId: string | null };
export type WeeklyPlan = {
  id: string;
  title: string;
  weekStart: string;
  yearGoalId: string | null;
  todoCount: number;
  doneCount: number;
  progress: number;
};
export type YearGoal = { id: string; title: string; year: number };

export const STATUSES: { value: Status; label: string }[] = [
  { value: "todo", label: "할 일" },
  { value: "doing", label: "진행 중" },
  { value: "done", label: "완료" },
];

const CODE_TEXT: Record<string, string> = {
  VALIDATION_ERROR: "입력값을 확인해 주세요",
  INVALID_REFERENCE: "연결하려는 항목이 없습니다. 새로고침 후 다시 선택해 주세요",
  NOT_FOUND: "항목을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다",
  INTERNAL_ERROR: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요",
  UNAUTHORIZED: "로그인이 필요합니다",
};

type ErrorBody = { error?: { code?: string; message?: string; details?: Record<string, string> | null } } | null;

export class ApiError extends Error {
  constructor(
    message: string,
    public details: Record<string, string> | null = null,
  ) {
    super(details ? `${message} (${Object.values(details).join(" / ")})` : message);
  }
}

export async function api<T = void>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ApiError("서버에 연결할 수 없습니다. 네트워크를 확인해 주세요");
  }
  if (res.status === 204) return undefined as T; // DELETE: body 없음
  // 세션 만료 등: 로그인 화면으로 이동. 호출부는 아래 ApiError로 평소처럼 처리됨
  // 컴포넌트 밖 fetch 래퍼라 useRouter 사용 불가 + 세션 상태를 새로 읽도록 전체 페이지 이동이 의도
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (res.status === 401 && window.location.pathname !== "/login") window.location.assign("/login");
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as ErrorBody)?.error;
    const text = CODE_TEXT[err?.code ?? ""] ?? `요청에 실패했습니다 (${res.status})`;
    throw new ApiError(err?.message ? `${text}: ${err.message}` : text, err?.details ?? null);
  }
  return json as T;
}

// GET 목록. path가 바뀌면 이전 요청 취소 + 로딩 상태로 돌아감. reload는 기존 데이터를 유지한 채 다시 조회
export function useList<T>(path: string) {
  const [state, setState] = useState<{ path: string; data?: T[]; error?: string }>({ path: "" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    api<T[]>(path, "GET", undefined, ctrl.signal).then(
      (data) => setState({ path, data }),
      (e: Error) => !ctrl.signal.aborted && setState({ path, error: e.message }),
    );
    return () => ctrl.abort();
  }, [path, tick]);
  const fresh = state.path === path;
  return {
    data: fresh ? state.data : undefined,
    error: fresh ? state.error : undefined,
    reload: useCallback(() => setTick((t) => t + 1), []),
    retry: useCallback(() => {
      setState({ path: "" });
      setTick((t) => t + 1);
    }, []),
    setData: useCallback((fn: (d: T[]) => T[]) => setState((s) => (s.data ? { ...s, data: fn(s.data) } : s)), []),
  };
}

// 폼 제출·삭제 공통: 진행 중 중복 실행 방지 + 에러 보관
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  async function run(fn: () => Promise<unknown>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(String(e)));
      return false;
    } finally {
      setPending(false);
    }
  }
  return { pending, error, run };
}

// 입력 요소를 에러 메시지와 연결 (details에 해당 필드가 있을 때만)
export function fieldError(error: ApiError | null, key: string, errorId: string) {
  return error?.details?.[key] ? { "aria-invalid": true, "aria-describedby": errorId } : {};
}

// 로컬 시간 기준 오늘 "YYYY-MM-DD"
export const today = () => new Date().toLocaleDateString("sv-SE");

// "YYYY-MM-DD" → 그 주 월요일 "YYYY-MM-DD" (문자열 날짜라 UTC로 계산해도 시간대 오차 없음)
export function toMonday(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
