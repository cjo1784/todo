import { handle } from "@/lib/api";

export const GET = handle(async (_req, _ctx, user) =>
  Response.json({ id: user.id, username: user.username, avatarUrl: user.avatarUrl }),
);
