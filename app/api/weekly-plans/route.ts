import { assertRef, handle, readBody } from "@/lib/api";
import { WeeklyPlan, withProgress } from "@/models/WeeklyPlan";
import { YearGoal } from "@/models/YearGoal";

export const GET = handle(async (_req, _ctx, user) => {
  const plans = await WeeklyPlan.find({ userId: user._id }).sort({ weekStart: 1, _id: 1 });
  return Response.json(await withProgress(plans));
});

export const POST = handle(async (req: Request, _ctx, user) => {
  const data = await readBody(req, ["title", "weekStart", "yearGoalId"]);
  await assertRef(YearGoal, data.yearGoalId, "yearGoalId", user._id);
  const plan = await WeeklyPlan.create({ ...data, userId: user._id });
  return Response.json((await withProgress([plan]))[0], { status: 201 });
});
