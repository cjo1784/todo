import { handle, readBody } from "@/lib/api";
import { YearGoal } from "@/models/YearGoal";

export const GET = handle(async () => Response.json(await YearGoal.find().sort({ year: 1, _id: 1 })));

export const POST = handle(async (req: Request) => {
  const data = await readBody(req, ["title", "year"]);
  return Response.json(await YearGoal.create(data), { status: 201 });
});
