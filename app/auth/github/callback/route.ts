import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  cookieOptions,
  createSession,
  deleteSession,
  readCookie,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  STATE_COOKIE,
} from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";

const GITHUB_TIMEOUT_MS = 10_000; // 초과 시 AbortSignal이 예외를 던져 /login?error=oauth

const sameState = (a: string | undefined, b: string | null) =>
  !!a && !!b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// GitHub access token은 사용자 정보 조회에만 쓰고 저장하지 않음
async function fetchGithubUser(code: string, redirectUri: string) {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  // 잘못된 code도 200 + { error }로 옴
  const { access_token } = tokenRes.ok ? await tokenRes.json() : {};
  if (typeof access_token !== "string") return null;
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${access_token}`, Accept: "application/vnd.github+json", "User-Agent": "todo-app" },
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  const gh = userRes.ok ? await userRes.json() : null;
  return typeof gh?.id === "number" && typeof gh.login === "string" && typeof gh.avatar_url === "string"
    ? (gh as { id: number; login: string; avatar_url: string })
    : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const redirect = (path: string) => {
    const res = NextResponse.redirect(new URL(path, req.url), 302);
    res.cookies.set(STATE_COOKIE, "", cookieOptions(0)); // state 쿠키는 결과와 무관하게 항상 삭제
    return res;
  };

  if (url.searchParams.has("error")) return redirect("/login?error=denied");
  if (!sameState(readCookie(req, STATE_COOKIE), url.searchParams.get("state"))) return redirect("/login?error=state");
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_URL } = process.env;
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !APP_URL) return redirect("/login?error=config");
  const code = url.searchParams.get("code");
  if (!code) return redirect("/login?error=oauth");

  let token: string;
  try {
    const gh = await fetchGithubUser(code, `${APP_URL}/auth/github/callback`);
    if (!gh) return redirect("/login?error=oauth");
    await connectDB();
    const user = await User.findOneAndUpdate(
      { githubId: gh.id },
      { username: gh.login, avatarUrl: gh.avatar_url },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    await deleteSession(req); // 로그인 상태에서 재로그인하면 이전 세션 문서를 남기지 않음
    token = await createSession(user._id);
  } catch (e) {
    console.error("GitHub login failed:", e instanceof Error ? e.message : e);
    return redirect("/login?error=oauth");
  }
  const res = redirect("/");
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE));
  return res;
}
