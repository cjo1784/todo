import { NextResponse } from "next/server";
import { cookieOptions, deleteSession, SESSION_COOKIE } from "@/lib/auth";
import { connectDB } from "@/lib/db";

// 세션 문서가 없어도 쿠키는 지움. DB 삭제가 실패하면 500으로 드러나게 둠(쿠키만 지우고 성공처럼 보이지 않게)
export async function POST(req: Request) {
  // CSRF: 다른 출처의 폼 POST는 거부(쿠키·세션 변경 없음). Origin이 없는 요청은 기존대로 처리
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(process.env.APP_URL || req.url).origin) {
    return Response.json({ error: { code: "FORBIDDEN", message: "Cross-origin request", details: null } }, { status: 403 });
  }
  await connectDB();
  await deleteSession(req);
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  return res;
}
