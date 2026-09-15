import { assertRef, handle, readBody } from "@/lib/api";
import { WeeklyPlan, withProgress } from "@/models/WeeklyPlan";
import { YearGoal } from "@/models/YearGoal";

export const GET = handle(async () => {
  const plans = await WeeklyPlan.find().sort({ weekStart: 1, _id: 1 });
  return Response.json(await withProgress(plans));
});

export const POST = handle(async (req: Request) => {
  const data = await readBody(req, ["title", "weekStart", "yearGoalId"]);
  await assertRef(YearGoal, data.yearGoalId, "yearGoalId");
  const plan = await WeeklyPlan.create(data);
  return Response.json((await withProgress([plan]))[0], { status: 201 });
});
