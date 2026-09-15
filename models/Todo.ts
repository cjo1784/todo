import mongoose from "mongoose";
import { toJSON } from "@/lib/db";
import { isDateString } from "@/lib/date";

export const TODO_STATUSES = ["todo", "doing", "done"] as const;

const schema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    date: {
      type: String,
      default: null,
      validate: { validator: (v: unknown) => v == null || isDateString(v), message: "date must be YYYY-MM-DD" },
    },
    status: { type: String, enum: TODO_STATUSES, default: "todo" },
    weeklyPlanId: { type: mongoose.Schema.Types.ObjectId, ref: "WeeklyPlan", default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { toJSON },
);
// 쿼리 패턴: ?date= 목록, ?weeklyPlanId= 목록 · 진행률 집계 · 주간 계획 삭제 시 연결 해제
schema.index({ date: 1 });
schema.index({ weeklyPlanId: 1 });

export const Todo =
  (mongoose.models.Todo as mongoose.Model<mongoose.InferSchemaType<typeof schema>>) ??
  mongoose.model("Todo", schema);
