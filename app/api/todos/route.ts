import { assertObjectId, assertRef, handle, HttpError, readBody } from "@/lib/api";
import { isDateString } from "@/lib/date";
import { Todo } from "@/models/Todo";
import { WeeklyPlan } from "@/models/WeeklyPlan";

export const GET = handle(async (req: Request, _ctx, user) => {
  const params = new URL(req.url).searchParams;
  const filter: Record<string, string> = {};
  const date = params.get("date");
  if (date !== null) {
    if (!isDateString(date)) throw new HttpError(400, "VALIDATION_ERROR", "date must be YYYY-MM-DD");
    filter.date = date;
  }
  const weeklyPlanId = params.get("weeklyPlanId");
  if (weeklyPlanId !== null) {
    assertObjectId(weeklyPlanId, "weeklyPlanId");
    filter.weeklyPlanId = weeklyPlanId;
  }
  return Response.json(await Todo.find({ ...filter, userId: user._id }).sort({ date: 1, _id: 1 }));
});

export const POST = handle(async (req: Request, _ctx, user) => {
  const data = await readBody(req, ["title", "date", "weeklyPlanId"]);
  await assertRef(WeeklyPlan, data.weeklyPlanId, "weeklyPlanId", user._id);
  return Response.json(await Todo.create({ ...data, userId: user._id }), { status: 201 });
});
