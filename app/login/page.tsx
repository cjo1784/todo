import type { ReactNode } from "react";
import { cardClass, pageTitleClass, primaryButtonClass, Themed } from "@/components/ui";

// /auth/github/callback이 붙이는 ?error= 코드 (artifacts/00-input.md 계약)
const ERROR_TEXT: Record<string, ReactNode> = {
  state: "보안 확인에 실패했습니다. 다시 시도해 주세요.",
  oauth: "GitHub 인증에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  config: (
    <>
      서버에 GitHub OAuth 설정이 없습니다. <code className="font-mono">docs/AUTH_SETUP.md</code>를 참고해 환경 변수를 설정해 주세요.
    </>
  ),
  denied: "로그인을 취소했습니다.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const code = typeof error === "string" ? error : undefined;
  const message = code === undefined ? null : (ERROR_TEXT[code] ?? "알 수 없는 오류가 발생했습니다. 다시 시도해 주세요.");

  return (
    <div className="grid place-items-center py-8 sm:py-16">
      <div className={`${cardClass} flex w-full max-w-md flex-col gap-6 p-8 dev:p-6`}>
        <div className="flex flex-col gap-2">
          <h1 className={pageTitleClass}>
            <Themed
              colorful={
                <>
                  <span aria-hidden="true">✅ </span>할 일 관리
                </>
              }
              dev={
                <>
                  <span aria-hidden="true" className="text-ok">
                    ${" "}
                  </span>
                  gh auth login
                </>
              }
            />
          </h1>
          <p className="text-muted">
            <Themed colorful="GitHub 계정으로 로그인하고 내 할 일을 관리하세요." dev="# GitHub 계정으로 로그인해야 합니다" />
          </p>
        </div>

        {message && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            <span className="hidden dev:inline">error: </span>
            {message}
          </p>
        )}

        {/* 라우트 핸들러가 GitHub로 302 → next/link 대신 전체 페이지 이동 */}
        <a href="/auth/github" className={`${primaryButtonClass} flex items-center justify-center gap-2 py-3 text-base`}>
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-5 dev:hidden" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <Themed
            colorful="GitHub로 로그인"
            dev={
              <>
                <span aria-hidden="true">❯ </span>GitHub로 로그인
              </>
            }
          />
        </a>
      </div>
    </div>
  );
}
