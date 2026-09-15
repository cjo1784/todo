import mongoose from "mongoose";
import { connectDB } from "@/lib/db";

export type IdContext = { params: Promise<{ id: string }> };

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function errorResponse(status: number, code: string, message: string, details: unknown = null) {
  return Response.json({ error: { code, message, details } }, { status });
}

// 모든 route handler 공통: DB 연결(요청 시점) + 에러 → { error: { code, message, details } }
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      await connectDB();
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return errorResponse(e.status, e.code, e.message);
      if (e instanceof mongoose.Error.ValidationError) {
        const details = Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v.message]));
        return errorResponse(400, "VALIDATION_ERROR", "Invalid input", details);
      }
      if (e instanceof mongoose.Error.CastError) {
        return errorResponse(400, "VALIDATION_ERROR", "Invalid input", { [e.path]: e.message });
      }
      console.error(e instanceof Error ? e.message : e);
      return errorResponse(500, "INTERNAL_ERROR", "Internal server error");
    }
  };
}

export async function readBody(req: Request, keys: string[]): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "INVALID_JSON", "Body must be a JSON object");
  }
  return Object.fromEntries(keys.filter((k) => k in body).map((k) => [k, body[k]]));
}

export function assertObjectId(id: unknown, field = "id"): asserts id is string {
  if (typeof id !== "string" || !/^[0-9a-f]{24}$/i.test(id)) {
    throw new HttpError(400, "INVALID_ID", `${field} is not a valid ObjectId`);
  }
}

export async function findOr404<T>(model: mongoose.Model<T>, ctx: IdContext) {
  const { id } = await ctx.params;
  assertObjectId(id);
  const doc = await model.findById(id);
  if (!doc) throw new HttpError(404, "NOT_FOUND", "Resource not found");
  return doc;
}

// 상위 항목 연결: undefined(미전달)/null(해제)은 통과, 그 외엔 실제 존재해야 함
export async function assertRef<T>(model: mongoose.Model<T>, value: unknown, field: string) {
  if (value === undefined || value === null) return;
  const ok = typeof value === "string" && /^[0-9a-f]{24}$/i.test(value) && (await model.exists({ _id: value }));
  if (!ok) throw new HttpError(400, "INVALID_REFERENCE", `${field} does not reference an existing item`);
}
