import mongoose from "mongoose";

// 핫 리로드 시 모듈이 다시 평가돼도 연결을 재사용하도록 globalThis에 캐시
const cache = globalThis as unknown as { mongooseConn?: Promise<typeof mongoose> };

export function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Add it to .env.local");
  cache.mongooseConn ??= mongoose.connect(uri).catch((e) => {
    cache.mongooseConn = undefined; // 실패한 연결은 캐시하지 않음 → 다음 요청에서 재시도
    throw e;
  });
  return cache.mongooseConn;
}

// 모든 모델 공통 JSON 형태: _id → id(string), __v 제거, userId(소유자)는 응답에 노출하지 않음
export const toJSON = {
  virtuals: true,
  versionKey: false,
  transform: (_doc: unknown, ret: Record<string, unknown>) => {
    delete ret._id;
    delete ret.userId;
    return ret;
  },
};
