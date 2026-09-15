import crypto from "node:crypto";
import mongoose from "mongoose";
import { HttpError } from "@/lib/api";
import { Session } from "@/models/Session";
import { User, type UserDoc } from "@/models/User";

export const SESSION_COOKIE = "session"; // proxy.ts에도 같은 이름이 있음 (proxy는 mongoose를 import하지 않음)
export const STATE_COOKIE = "oauth_state";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30일(초)

export const randomToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge,
});

export function readCookie(req: Request, name: string) {
  const pair = req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`));
  return pair?.slice(name.length + 1) || undefined;
}

export async function createSession(userId: mongoose.Types.ObjectId) {
  const token = randomToken();
  await Session.create({ tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000) });
  return token;
}

async function getSessionUser(req: Request): Promise<UserDoc | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  return session && User.findById(session.userId);
}

export async function deleteSession(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
}

export async function requireUser(req: Request) {
  const user = await getSessionUser(req);
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "Login required");
  return user;
}
