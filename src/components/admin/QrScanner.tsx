"use client";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Button, Textarea } from "@/components/ui";

/** Camera QR scanner (jsQR) with a paste fallback for desktop admins. */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    done.current = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const tick = () => {
          if (done.current) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA && canvas.current) {
            const c = canvas.current;
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, c.width, c.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (code?.data) {
              done.current = true;
              onResult(code.data);
              return;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setError("Camera unavailable (" + (e as Error).message + "). Paste the code text below instead.");
      }
    })();
    return () => {
      done.current = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="flex flex-col gap-3">
      {!error ? (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
          <div className="pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-white/70" />
        </div>
      ) : (
        <p className="text-sm text-danger">{error}</p>
      )}
      <canvas ref={canvas} className="hidden" />
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Paste code text instead</summary>
        <Textarea rows={3} className="mt-2" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="SPOT6:…" />
        <Button size="sm" className="mt-2" disabled={!paste.trim()} onClick={() => onResult(paste.trim())}>
          Decode
        </Button>
      </details>
    </div>
  );
}
