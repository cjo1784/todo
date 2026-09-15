import { findOr404, handle, readBody, type IdContext } from "@/lib/api";
import { WeeklyPlan } from "@/models/WeeklyPlan";
import { YearGoal } from "@/models/YearGoal";

export const GET = handle(async (_req: Request, ctx: IdContext, user) =>
  Response.json(await findOr404(YearGoal, ctx, user._id)),
);

export const PATCH = handle(async (req: Request, ctx: IdContext, user) => {
  const goal = await findOr404(YearGoal, ctx, user._id);
  goal.set(await readBody(req, ["title", "year"]));
  await goal.save();
  return Response.json(goal);
});

export const DELETE = handle(async (_req: Request, ctx: IdContext, user) => {
  const goal = await findOr404(YearGoal, ctx, user._id);
  // ponytail: 트랜잭션 없음 (weekly-plans DELETE와 동일)
  await goal.deleteOne();
  await WeeklyPlan.updateMany({ yearGoalId: goal._id, userId: user._id }, { yearGoalId: null });
  return new Response(null, { status: 204 });
});
