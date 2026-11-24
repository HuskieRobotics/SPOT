/**
 * Admin sign-in (SEC-4, ADR 0004): one shared password from `SPOT_ADMIN_PASSWORD`, exchanged
 * for a signed cookie.
 *
 * The cookie holds nothing secret, only when it was issued and when it expires, signed with
 * HMAC-SHA-256. The signing key is derived from the password with PBKDF2, so:
 *  - there is no second secret for students to set up;
 *  - changing the password signs every admin out, which is what changing it should do;
 *  - a stolen cookie does not reveal the password, and guessing it from the cookie costs a
 *    slow PBKDF2 per guess.
 *
 * The check needs no database, so `src/proxy.ts` can do all of it before a request reaches an
 * admin page or route. Web Crypto only, so it runs wherever Next runs proxy.
 */

export const ADMIN_COOKIE = "spot-admin";

/**
 * How long a sign-in lasts. An event lasts several days and may be entirely offline, so a
 * session must never expire during one (SEC-9).
 */
export const ADMIN_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

const PBKDF2_ITERATIONS = 210_000;
const SALT = new TextEncoder().encode("spot-admin-session-v1");

interface Payload {
  v: 1;
  /** Issued at, epoch ms. */
  iat: number;
  /** Expires at, epoch ms. */
  exp: number;
}

function adminPassword(): string | null {
  const p = process.env.SPOT_ADMIN_PASSWORD;
  return p && p.length > 0 ? p : null;
}

export function adminPasswordConfigured(): boolean {
  return adminPassword() !== null;
}

let cachedKey: { password: string; key: Promise<CryptoKey> } | null = null;

function signingKey(password: string): Promise<CryptoKey> {
  if (cachedKey?.password !== password) {
    const key = (async () => {
      const base = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveKey"],
      );
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt: SALT, iterations: PBKDF2_ITERATIONS },
        base,
        { name: "HMAC", hash: "SHA-256", length: 256 },
        false,
        ["sign", "verify"],
      );
    })();
    cachedKey = { password, key };
  }
  return cachedKey.key;
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  return new Uint8Array(Buffer.from(text, "base64url"));
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/**
 * Whether `supplied` is the admin password. Compares digests in constant time, so the time it
 * takes says nothing about how much of the guess was right. False when no password is set.
 */
export async function isAdminPassword(supplied: unknown): Promise<boolean> {
  const password = adminPassword();
  if (password === null || typeof supplied !== "string") return false;
  const [a, b] = await Promise.all([sha256(supplied), sha256(password)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** A new session cookie value. Throws if no admin password is set. */
export async function createAdminSession(now = Date.now()): Promise<string> {
  const password = adminPassword();
  if (password === null) throw new Error("SPOT_ADMIN_PASSWORD is not set");
  const payload: Payload = { v: 1, iat: now, exp: now + ADMIN_SESSION_MS };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(password),
    new TextEncoder().encode(body),
  );
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Whether a cookie value is a session signed with the current password and not expired. */
export async function verifyAdminSession(
  value: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  const password = adminPassword();
  if (password === null || !value) return false;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra !== undefined) return false;
  const sig = fromBase64Url(signature);
  if (!sig) return false;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await signingKey(password),
    sig,
    new TextEncoder().encode(body),
  );
  if (!valid) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    return payload.v === 1 && typeof payload.exp === "number" && now < payload.exp;
  } catch {
    return false;
  }
}

/**
 * Cookie settings (Next's authentication guide): not readable by scripts, sent only to SPOT
 * itself, and only over HTTPS when the request came over HTTPS, so `next dev` and the browser
 * tests on http://localhost still work.
 */
export function adminCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_MS / 1000),
  };
}

/** Whether the browser reached SPOT over HTTPS, directly or through nginx or Cloud Run. */
export function cameOverHttps(request: { headers: Headers; nextUrl?: URL; url: string }): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return new URL(request.url).protocol === "https:";
}
