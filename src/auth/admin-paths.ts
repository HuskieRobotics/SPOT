/**
 * Which requests are admin requests (SEC-4, SEC-5, #120).
 *
 * One rule, enforced in one place (`src/proxy.ts`): every admin page lives under `/admin` and
 * every admin route under `/api/admin`. Admin actions are route handlers there, never Server
 * Functions, which proxy does not see as separate routes. `tests/unit/admin-auth.test.ts`
 * checks that every page and route under those folders is guarded, and that nothing outside them
 * is named as an admin action.
 *
 * The exceptions are what an admin needs before they have signed in.
 */

export const ADMIN_PAGES = "/admin";
export const ADMIN_API = "/api/admin";

export const ADMIN_SIGN_IN_PAGE = "/admin/sign-in";
export const ADMIN_SESSION_API = "/api/admin/session";

const OPEN = new Set([ADMIN_SIGN_IN_PAGE, ADMIN_SESSION_API]);

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Whether the path needs an admin session. */
export function needsAdmin(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (OPEN.has(path)) return false;
  return under(path, ADMIN_PAGES) || under(path, ADMIN_API);
}

export function isAdminApi(pathname: string): boolean {
  return under(pathname, ADMIN_API);
}
