import { assertRef, findOr404, handle, readBody, type IdContext } from "@/lib/api";
import { Todo } from "@/models/Todo";
import { WeeklyPlan } from "@/models/WeeklyPlan";

export const GET = handle(async (_req: Request, ctx: IdContext, user) =>
  Response.json(await findOr404(Todo, ctx, user._id)),
);

export const PATCH = handle(async (req: Request, ctx: IdContext, user) => {
  const todo = await findOr404(Todo, ctx, user._id);
  const data = await readBody(req, ["title", "date", "status", "weeklyPlanId"]);
  await assertRef(WeeklyPlan, data.weeklyPlanId, "weeklyPlanId", user._id);
  todo.set(data);
  await todo.save();
  return Response.json(todo);
});

export const DELETE = handle(async (_req: Request, ctx: IdContext, user) => {
  const todo = await findOr404(Todo, ctx, user._id);
  await todo.deleteOne();
  return new Response(null, { status: 204 });
});
