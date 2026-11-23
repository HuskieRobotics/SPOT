/** Field-map helpers shared by the server (validation) and the browser (previews). */

export const MAX_MAP_BYTES = 2 * 1024 * 1024;

export type MapContentType = "image/svg+xml" | "image/png" | "image/jpeg" | "image/webp";

/** Paths/URLs saved without a leading slash in old configs ("img/field.svg") still resolve. */
export function normalizeImageSrc(src: string): string {
  const s = String(src ?? "").trim();
  if (!s) return s;
  return /^(https?:)?\/\//.test(s) || s.startsWith("/") ? s : `/${s}`;
}

/**
 * Decide what an uploaded file really is from its bytes (the declared type and file name
 * are not trusted) and reject SVGs that contain anything executable.
 */
export function inspectUpload(bytes: Uint8Array): { ok: true; contentType: MapContentType } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > MAX_MAP_BYTES) return { ok: false, error: `The file is larger than ${MAX_MAP_BYTES / 1024 / 1024} MB.` };
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ok: true, contentType: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ok: true, contentType: "image/jpeg" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ok: true, contentType: "image/webp" };
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (/<svg[\s>]/i.test(text)) {
    if (/<script\b|<foreignObject\b|<!ENTITY|\son[a-z]+\s*=|javascript:/i.test(text))
      return { ok: false, error: "This SVG contains scripts or embedded web content. Re-export it as a plain drawing (no scripts, no foreignObject)." };
    return { ok: true, contentType: "image/svg+xml" };
  }
  return { ok: false, error: "Not a supported image. Use SVG, PNG, JPG or WebP." };
}

export function isValidMapUrl(url: string): boolean {
  return url.length <= 500 && /^https?:\/\/[^\s]+$/i.test(url);
}
