import { assertRef, findOr404, handle, readBody, type IdContext } from "@/lib/api";
import { Todo } from "@/models/Todo";
import { WeeklyPlan, withProgress } from "@/models/WeeklyPlan";
import { YearGoal } from "@/models/YearGoal";

export const GET = handle(async (_req: Request, ctx: IdContext, user) => {
  const plan = await findOr404(WeeklyPlan, ctx, user._id);
  return Response.json((await withProgress([plan]))[0]);
});

export const PATCH = handle(async (req: Request, ctx: IdContext, user) => {
  const plan = await findOr404(WeeklyPlan, ctx, user._id);
  const data = await readBody(req, ["title", "weekStart", "yearGoalId"]);
  await assertRef(YearGoal, data.yearGoalId, "yearGoalId", user._id);
  plan.set(data);
  await plan.save();
  return Response.json((await withProgress([plan]))[0]);
});

export const DELETE = handle(async (_req: Request, ctx: IdContext, user) => {
  const plan = await findOr404(WeeklyPlan, ctx, user._id);
  // ponytail: 트랜잭션 없음. 삭제 후 연결 해제가 실패하면 할 일에 끊긴 참조가 남음. 문제되면 session.withTransaction으로 감싸기
  await plan.deleteOne();
  await Todo.updateMany({ weeklyPlanId: plan._id, userId: user._id }, { weeklyPlanId: null });
  return new Response(null, { status: 204 });
});
