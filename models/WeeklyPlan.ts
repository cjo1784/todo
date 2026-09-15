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
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { toJSON },
);
// 쿼리 패턴: 1년 목표 삭제 시 연결 해제
schema.index({ yearGoalId: 1 });

export const WeeklyPlan =
  (mongoose.models.WeeklyPlan as mongoose.Model<mongoose.InferSchemaType<typeof schema>>) ??
  mongoose.model("WeeklyPlan", schema);

// 진행률은 저장하지 않고 조회 시 계산. 계획 수와 무관하게 집계 쿼리 1번 (N+1 없음)
// (계획, 할 일 소유자) 쌍으로 묶고 계획 소유자와 같은 쌍만 사용 → 남의 할 일이 연결돼 있어도 진행률에 포함 안 됨
export async function withProgress(plans: mongoose.HydratedDocument<unknown>[]) {
  const counts: {
    _id: { plan: mongoose.Types.ObjectId; user: mongoose.Types.ObjectId };
    todoCount: number;
    doneCount: number;
  }[] = await Todo.aggregate([
    { $match: { weeklyPlanId: { $in: plans.map((p) => p._id) } } },
    {
      $group: {
        _id: { plan: "$weeklyPlanId", user: "$userId" },
        todoCount: { $sum: 1 },
        doneCount: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
      },
    },
  ]);
  const byId = new Map(counts.map((c) => [`${c._id.plan}:${c._id.user}`, c]));
  return plans.map((p) => {
    const { todoCount = 0, doneCount = 0 } = byId.get(`${p._id}:${p.get("userId")}`) ?? {};
    return { ...p.toJSON(), todoCount, doneCount, progress: calcProgress(doneCount, todoCount) };
  });
}
