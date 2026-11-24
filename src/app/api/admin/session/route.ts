/**
 * Admin sign-in and sign-out (SEC-4). Open to anyone: it is how an admin gets a session.
 *
 * GET    → `{ signedIn, configured }`
 * POST   `{ password }` → 204 with the session cookie; 401 wrong password; 503 none set
 * DELETE → 204, cookie cleared
 *
 * No response ever contains the password (SEC-4).
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  adminPasswordConfigured,
  cameOverHttps,
  createAdminSession,
  isAdminPassword,
  verifyAdminSession,
} from "@/auth/admin-session";

/** A wrong guess waits this long, which slows guessing without bothering a person. */
const WRONG_PASSWORD_DELAY_MS = 500;

export async function GET(request: NextRequest) {
  return NextResponse.json({
    signedIn: await verifyAdminSession(request.cookies.get(ADMIN_COOKIE)?.value),
    configured: adminPasswordConfigured(),
  });
}

export async function POST(request: NextRequest) {
  if (!adminPasswordConfigured())
    return NextResponse.json(
      {
        error: "no-admin-password",
        message: "This server has no admin password. Set SPOT_ADMIN_PASSWORD and restart it.",
      },
      { status: 503 },
    );
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (!(await isAdminPassword(body?.password))) {
    await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS));
    return NextResponse.json(
      { error: "wrong-password", message: "That is not the admin password." },
      { status: 401 },
    );
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(
    ADMIN_COOKIE,
    await createAdminSession(),
    adminCookieOptions(cameOverHttps(request)),
  );
  return response;
}

export async function DELETE(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(ADMIN_COOKIE, "", {
    ...adminCookieOptions(cameOverHttps(request)),
    maxAge: 0,
  });
  return response;
}
