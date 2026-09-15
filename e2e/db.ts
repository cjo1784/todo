// E2E 전용 DB 헬퍼: [e2e-check] 사용자 생성·세션 발급·정리
import mongoose from "mongoose";
import { createSession } from "../lib/auth";
import { connectDB } from "../lib/db";
import { Session } from "../models/Session";
import { User } from "../models/User";

export const TAG = "[e2e-check]";
const tagged = { username: { $regex: /^\[e2e-check\]/ } };

export async function createTestUser(name: string, githubId: number) {
  await connectDB();
  // avatarUrl은 next.config.ts remotePatterns에 맞춰야 Header의 next/image가 깨지지 않음
  const user = await User.create({ githubId, username: `${TAG} ${name}`, avatarUrl: "https://avatars.githubusercontent.com/u/9919?v=4" });
  return { user, token: await createSession(user._id) };
}

export async function countSessions(userId: mongoose.Types.ObjectId) {
  await connectDB();
  return Session.countDocuments({ userId });
}

// 실패해도 호출되도록 global-setup teardown에서 사용. 남은 건수를 돌려준다
export async function cleanup() {
  await connectDB();
  const ids = (await User.find(tagged, { _id: 1 })).map((u) => u._id as mongoose.Types.ObjectId);
  const byOwner = { userId: { $in: ids } };
  // 제목 태그로도 지운다: 서버가 오래된 스키마로 userId 없이 저장한 문서까지 남기지 않기 위해
  const owned = { $or: [byOwner, { title: { $regex: /^\[e2e-check\]/ } }] };
  const cols = ["todos", "weeklyplans", "yeargoals"].map((n) => mongoose.connection.db!.collection(n));
  await Promise.all([Session.deleteMany(byOwner), ...cols.map((c) => c.deleteMany(owned))]);
  await User.deleteMany(tagged);
  const [todos, weeklyPlans, yearGoals] = await Promise.all(cols.map((c) => c.countDocuments(owned)));
  const left = {
    users: await User.countDocuments(tagged),
    sessions: await Session.countDocuments(byOwner),
    todos,
    weeklyPlans,
    yearGoals,
  };
  return left;
}

// lib/db.ts가 연결 Promise를 globalThis에 캐시하므로, 끊은 뒤 다시 connectDB()가 새로 연결하도록 캐시도 비운다
export async function disconnect() {
  await mongoose.disconnect();
  (globalThis as { mongooseConn?: unknown }).mongooseConn = undefined;
}
