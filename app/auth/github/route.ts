import { NextResponse } from "next/server";
import { cookieOptions, randomToken, STATE_COOKIE } from "@/lib/auth";

export function GET(req: Request) {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_URL } = process.env;
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !APP_URL) {
    return NextResponse.redirect(new URL("/login?error=config", req.url), 302);
  }
  const state = randomToken();
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.search = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${APP_URL}/auth/github/callback`,
    scope: "read:user",
    state,
  }).toString();
  const res = NextResponse.redirect(authorize, 302);
  res.cookies.set(STATE_COOKIE, state, cookieOptions(10 * 60));
  return res;
}
