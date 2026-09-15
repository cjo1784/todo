"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
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

export default function Header() {
  const pathname = usePathname();
  const dev = useSyncExternalStore(subscribe, isDevTheme, () => false);

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
        <button type="button" aria-pressed={dev} onClick={toggleTheme} className={`${buttonClass} ml-auto`}>
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
    </header>
  );
}
