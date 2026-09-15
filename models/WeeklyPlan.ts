import mongoose from "mongoose";
import { toJSON } from "@/lib/db";
import { isMonday } from "@/lib/date";
import { calcProgress } from "@/lib/progress";
import { Todo } from "@/models/Todo";

const schema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    weekStart: {
      type: String,
      required: true,
      validate: { validator: isMonday, message: "weekStart must be a Monday in YYYY-MM-DD" },
    },
    yearGoalId: { type: mongoose.Schema.Types.ObjectId, ref: "YearGoal", default: null },
  },
  { toJSON },
);
// 쿼리 패턴: 1년 목표 삭제 시 연결 해제
schema.index({ yearGoalId: 1 });

export const WeeklyPlan =
  (mongoose.models.WeeklyPlan as mongoose.Model<mongoose.InferSchemaType<typeof schema>>) ??
  mongoose.model("WeeklyPlan", schema);

// 진행률은 저장하지 않고 조회 시 계산. 계획 수와 무관하게 집계 쿼리 1번 (N+1 없음)
export async function withProgress(plans: mongoose.HydratedDocument<unknown>[]) {
  const counts: { _id: mongoose.Types.ObjectId; todoCount: number; doneCount: number }[] = await Todo.aggregate([
    { $match: { weeklyPlanId: { $in: plans.map((p) => p._id) } } },
    {
      $group: {
        _id: "$weeklyPlanId",
        todoCount: { $sum: 1 },
        doneCount: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
      },
    },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c]));
  return plans.map((p) => {
    const { todoCount = 0, doneCount = 0 } = byId.get(String(p._id)) ?? {};
    return { ...p.toJSON(), todoCount, doneCount, progress: calcProgress(doneCount, todoCount) };
  });
}
