"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { buttonClass, focusClass, Themed } from "@/components/ui";

const NAV = [
  { href: "/", label: "칸반 보드", cmd: "board" },
  { href: "/weekly", label: "주간 계획", cmd: "weekly" },
  { href: "/goals", label: "1년 목표", cmd: "goals" },
] as const;

// 테마 = <html data-theme>. layout의 인라인 스크립트가 첫 페인트 전에 저장값을 적용함
const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};
const isDevTheme = () => document.documentElement.dataset.theme === "dev";

type Me = { id: string; username: string; avatarUrl: string };

export default function Header() {
  const pathname = usePathname();
  const onLogin = pathname === "/login";
  const dev = useSyncExternalStore(subscribe, isDevTheme, () => false);
  // undefined = 조회 중, null = 미로그인(401, 사용자 영역 없음), "error" = 그 외 실패(로그아웃 버튼만 유지)
  const [me, setMe] = useState<Me | null | "error" | undefined>(undefined);

  // api()는 401이면 /login으로 보내므로 여기선 fetch 직접 사용. 미로그인 화면 이동은 proxy.ts 담당
  useEffect(() => {
    if (onLogin) return;
    const ctrl = new AbortController();
    fetch("/api/me", { signal: ctrl.signal })
      .then(async (res) => (res.ok ? ((await res.json()) as Me) : res.status === 401 ? null : ("error" as const)))
      .then(setMe, () => !ctrl.signal.aborted && setMe("error"));
    return () => ctrl.abort();
  }, [onLogin]);

  function toggleTheme() {
    const next = dev ? "colorful" : "dev";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // 저장 불가(시크릿 모드 등): 이번 방문에만 적용
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-card-line bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className={`text-lg font-extrabold tracking-tight text-fg dev:text-base dev:font-bold ${focusClass}`}>
          <Themed
            colorful={
              <>
                <span aria-hidden="true">✅ </span>할 일 관리
              </>
            }
            dev={
              <>
                ~/todo <span className="text-ok">❯</span>{" "}
                <span className="text-accent-strong">{NAV.find((n) => n.href === pathname)?.cmd}</span>
              </>
            }
          />
        </Link>
        {!onLogin && (
          <nav aria-label="주요 메뉴" className="flex flex-wrap gap-1">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${focusClass} ${
                    active
                      ? "bg-accent text-accent-fg shadow-md shadow-accent/25 dev:shadow-none"
                      : "text-muted hover:bg-accent-soft hover:text-accent-strong"
                  }`}
                >
                  <Themed colorful={n.label} dev={n.cmd} />
                </Link>
              );
            })}
          </nav>
        )}
        {/* 사용자 영역 + 테마 토글을 한 묶음으로: 좁은 화면에서 함께 줄바꿈 */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {!onLogin && typeof me === "object" && me && (
            <>
              <Image src={me.avatarUrl} alt={me.username} width={28} height={28} className="size-7 rounded-full" />
              <span className="text-sm font-semibold text-fg">
                <span aria-hidden="true" className="hidden text-muted dev:inline">
                  @
                </span>
                {me.username}
              </span>
            </>
          )}
          {/* 사용자 정보 조회가 401 외 이유로 실패해도 로그아웃은 가능해야 함 */}
          {!onLogin && me && (
            <form method="post" action="/auth/logout">
              <button type="submit" className={buttonClass}>
                <Themed colorful="로그아웃" dev="logout" />
              </button>
            </form>
          )}
          {/* 조회 중: 아바타 자리만 잡아 흔들림 최소화 */}
          {!onLogin && me === undefined && <span aria-hidden="true" className="size-7 rounded-full bg-surface-2" />}
          <button type="button" aria-pressed={dev} onClick={toggleTheme} className={buttonClass}>
            <Themed
              colorful={
                <>
                  <span aria-hidden="true">🖥️ </span>개발자 테마
                </>
              }
              dev={
                <>
                  <span aria-hidden="true" className="text-ok">
                    [x]{" "}
                  </span>
                  개발자 테마
                </>
              }
            />
          </button>
        </div>
      </div>
    </header>
  );
}
