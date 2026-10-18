import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, ZodSchema } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export const notFound = (what = "Record") => new HttpError(404, `${what} not found.`);

type RouteCtx = { params: Promise<Record<string, string>> };
type Handler = (req: NextRequest, ctx: RouteCtx) => Promise<unknown>;

/** Same-origin check for state-changing requests (CSRF defence on top of SameSite cookies). */
function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (curl) still need a valid session cookie
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Cross-site request blocked.");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "Cross-site request blocked.");
  }
}

export function toErrorResponse(e: unknown) {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const i = e.issues[0];
    const field = i?.path?.join(".");
    return NextResponse.json(
      { error: field ? `${field}: ${i.message}` : i?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2025") return NextResponse.json({ error: "Record not found." }, { status: 404 });
    if (e.code === "P2002")
      return NextResponse.json({ error: "A record with these details already exists." }, { status: 409 });
    if (e.code === "P2003")
      return NextResponse.json(
        { error: "This record is still linked to other records. Remove those links first." },
        { status: 409 },
      );
  }
  console.error("[api] unhandled error", e);
  return NextResponse.json(
    { error: "Something went wrong on our side. Please try again in a moment." },
    { status: 500 },
  );
}

export function route(fn: Handler, opts: { csrf?: boolean } = {}) {
  return async (req: NextRequest, ctx: RouteCtx) => {
    try {
      if (opts.csrf !== false && req.method !== "GET") checkOrigin(req);
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

export async function body<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  return schema.parse(json);
}

export function query(req: NextRequest) {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}

export function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
