import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true }, // sha256(쿠키 토큰). 원문 토큰은 저장하지 않음
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true },
});
// 만료 문서 자동 삭제. TTL 작업은 약 60초 주기라 조회 시에도 expiresAt을 확인함
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session =
  (mongoose.models.Session as mongoose.Model<mongoose.InferSchemaType<typeof schema>>) ??
  mongoose.model("Session", schema);
