import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerConfig } from "./env";

/**
 * Admin auth: the shared ACCESS_CODE is exchanged for an HMAC-signed, httpOnly cookie.
 * Multiple admins can be signed in at once. No code configured (or DEMO) = open access.
 */
const COOKIE = "spot_admin";
const MAX_AGE = 60 * 60 * 24 * 7;

function sign(value: string) {
  return crypto.createHmac("sha256", getServerConfig().sessionSecret).update(value).digest("base64url");
}

export function authRequired() {
  const c = getServerConfig();
  return !!c.accessCode && !c.demo;
}

export function checkCode(code: string) {
  const expected = getServerConfig().accessCode;
  const a = Buffer.from(String(code ?? ""));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sessionCookieValue() {
  const issued = Date.now().toString(36);
  return `${issued}.${sign(issued)}`;
}

export async function isAdmin(): Promise<boolean> {
  if (!authRequired()) return true;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [issued, sig] = raw.split(".");
  if (!issued || !sig || sign(issued) !== sig) return false;
  return Date.now() - parseInt(issued, 36) < MAX_AGE * 1000;
}

export function setSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, sessionCookieValue(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

/** Use at the top of admin route handlers: `const denied = await requireAdmin(); if (denied) return denied;` */
export async function requireAdmin(): Promise<NextResponse | null> {
  return (await isAdmin()) ? null : NextResponse.json({ error: "Admin sign-in required" }, { status: 401 });
}
