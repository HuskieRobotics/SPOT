/**
 * The one place admin requests are checked (SEC-4, SEC-5, #120). See `src/auth/admin-paths.ts`
 * for which paths are admin paths and `src/auth/admin-session.ts` for the cookie.
 *
 * A page without a valid session goes to the sign-in page and comes back afterwards; a route
 * gets 401 with a message, never a redirect, so a script can tell what happened.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SIGN_IN_PAGE, isAdminApi, needsAdmin } from "@/auth/admin-paths";
import { ADMIN_COOKIE, verifyAdminSession } from "@/auth/admin-session";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!needsAdmin(pathname)) return NextResponse.next();
  if (await verifyAdminSession(request.cookies.get(ADMIN_COOKIE)?.value))
    return NextResponse.next();
  if (isAdminApi(pathname))
    return NextResponse.json(
      { error: "admin-sign-in", message: "Sign in as an admin first." },
      { status: 401 },
    );
  const signIn = new URL(ADMIN_SIGN_IN_PAGE, request.url);
  signIn.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(signIn);
}

// Constants only: Next reads the matcher at build time. The proxy checks `needsAdmin` too, so a
// matcher that matches more than it should costs nothing.
export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*"],
};
