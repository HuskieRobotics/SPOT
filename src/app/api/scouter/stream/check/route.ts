/**
 * A test stream for a server's setup (#412; ADR 0001):
 * `GET /api/scouter/stream/check?seconds=70&every=25` sends a comment at once and then every
 * `every` seconds (1 to 60) for `seconds` (1 to 300), then `event: done`, and ends. The defaults
 * leave gaps longer than the scouters' 20 s heartbeat, and last longer than the minute after
 * which many proxies cut a quiet or long request.
 *
 * It sits under `/api/scouter/stream`, so nginx and Cloud Run treat it exactly as the scouters'
 * streams: `npm run deploy:check` reads it through the real proxy to see that each line arrives
 * when it is sent (not buffered) and that a stream lasting longer than a minute is not cut off.
 * Public: it holds no data.
 */
import { STREAM_HEADERS } from "@/sessions/hub";

export const dynamic = "force-dynamic";

const MAX_SECONDS = 300;
const MAX_EVERY = 60;

function clamp(value: string | null, fallback: number, max: number): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), max) : fallback;
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const seconds = clamp(params.get("seconds"), 70, MAX_SECONDS);
  const interval = Math.min(clamp(params.get("every"), 25, MAX_EVERY), seconds) * 1000;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const started = Date.now();
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          clearInterval(timer);
        }
      };
      send(`: check started, ${seconds} s\n\n`);
      timer = setInterval(() => {
        const elapsed = Date.now() - started;
        if (elapsed < seconds * 1000) return send(`: ${Math.round(elapsed / 1000)} s\n\n`);
        clearInterval(timer);
        send(`event: done\ndata: {"seconds":${seconds}}\n\n`);
        controller.close();
      }, interval);
      request.signal.addEventListener("abort", () => clearInterval(timer));
    },
    cancel() {
      clearInterval(timer);
    },
  });
  return new Response(body, { headers: STREAM_HEADERS });
}
