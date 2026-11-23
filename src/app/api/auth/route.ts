import { NextResponse } from "next/server";
import { route, json } from "@/lib/server/http";
import { authRequired, checkCode, clearSessionCookie, isAdmin, setSessionCookie } from "@/lib/server/auth";
import { getServerConfig } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ required: authRequired(), admin: await isAdmin(), demo: getServerConfig().demo }));

export const POST = route(async (req) => {
  const { code } = await req.json().catch(() => ({ code: "" }));
  if (!authRequired()) return json({ admin: true });
  if (!checkCode(String(code ?? ""))) return NextResponse.json({ error: "Wrong access code" }, { status: 401 });
  return setSessionCookie(NextResponse.json({ admin: true }));
});

export const DELETE = route(async () => clearSessionCookie(NextResponse.json({ admin: false })));
