import { NextResponse, type NextRequest } from "next/server";

// 낙관적 검사: 쿠키 존재만 확인하고 실제 세션 검증은 API(401)가 한다.
// 쿠키가 있는 사용자를 /login에서 /로 보내지 않는다 — 만료된 쿠키면 / ↔ /login 무한 루프가 됨
export function proxy(req: NextRequest) {
  if (req.cookies.has("session")) return NextResponse.next(); // lib/auth.ts SESSION_COOKIE
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // /login, /auth/**, /api/**, /_next/**, 확장자가 있는 정적 파일 제외
  matcher: ["/((?!login(?:/|$)|auth/|api/|_next/|.*\\.[^/]+$).*)"],
};
