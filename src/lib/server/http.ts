import "server-only";
import { NextResponse } from "next/server";
import { requireAdmin } from "./auth";

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: JSON errors instead of crashes, optional admin guard. */
export function route<C = unknown>(handler: Handler<C>, opts: { admin?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      if (opts.admin) {
        const denied = await requireAdmin();
        if (denied) return denied;
      }
      return await handler(req, ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`SPOT API error ${req.method} ${new URL(req.url).pathname}:`, e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
