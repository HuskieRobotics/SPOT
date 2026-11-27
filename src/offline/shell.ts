/**
 * What the service worker keeps on the device (OF-5, #361): the build's shell, read from the
 * build's own output when `/sw.js` is first asked for, so it lists exactly the files this build
 * serves and needs no step after `next build`.
 *
 * - Every file under `.next/static/`, served at `/_next/static/`: the scripts, styles and the
 *   self-hosted fonts (OF-6). Their names change with their contents.
 * - Every image in `public/`, such as the field map a season's configuration names. A new
 *   season's image put in `public/img/` is kept with no other change. Videos are left out.
 * - The web app manifest, and the pages that open offline.
 */
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import type { Shell } from "./service-worker";

/** Pages that open with no connection: the scouting client and the analysis dashboard (#390). The scanner joins in Phase 4. */
export const OFFLINE_PAGES = ["/", "/analysis"];

/** How long a page waits for the network before the cached copy (OF-7). */
export const PAGE_TIMEOUT_MS = 4_000;

export const MANIFEST_URL = "/manifest.webmanifest";

const IMAGES = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"]);

function files(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.isFile() ? [join(dir, e.name)] : [],
  );
}

const urlOf = (base: string, root: string, file: string) =>
  base + relative(root, file).split(sep).map(encodeURIComponent).join("/");

/** The shell of the build in `root` (the project folder), or null before a build. */
export function readShell(root: string = process.cwd()): Shell | null {
  let build: string;
  try {
    build = readFileSync(join(root, ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return null;
  }
  const built = join(root, ".next", "static");
  const publicDir = join(root, "public");
  const urls = [
    ...OFFLINE_PAGES,
    MANIFEST_URL,
    ...files(built).map((f) => urlOf("/_next/static/", built, f)),
    ...files(publicDir)
      .filter((f) => IMAGES.has(extname(f).toLowerCase()))
      .map((f) => urlOf("/", publicDir, f)),
  ];
  return {
    build,
    urls: [...new Set(urls)].sort(),
    pages: OFFLINE_PAGES,
    timeoutMs: PAGE_TIMEOUT_MS,
  };
}
