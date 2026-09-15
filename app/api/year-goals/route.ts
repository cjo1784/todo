import { handle, readBody } from "@/lib/api";
import { YearGoal } from "@/models/YearGoal";

export const GET = handle(async (_req, _ctx, user) =>
  Response.json(await YearGoal.find({ userId: user._id }).sort({ year: 1, _id: 1 })),
);

export const POST = handle(async (req: Request, _ctx, user) => {
  const data = await readBody(req, ["title", "year"]);
  return Response.json(await YearGoal.create({ ...data, userId: user._id }), { status: 201 });
});
