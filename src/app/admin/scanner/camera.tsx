"use client";

/**
 * The scanner's camera (#411, AD-19): the camera chosen, read several times a second for a QR
 * code, and a photo for when the camera can't be used (no HTTPS, a blocked permission, a laptop
 * without one). Codes are read in the browser with jsQR, so scanning works with no connection.
 */
import jsQR from "jsqr";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { field } from "../styles";

/** How often a frame is read, and the widest frame read: enough for a phone's code at arm's length. */
const FRAME_MS = 150;
const MAX_WIDTH = 800;

/** The text of the QR code in an image, or null. */
function codeIn(
  source: CanvasImageSource,
  width: number,
  height: number,
  canvas: HTMLCanvasElement,
  thorough: boolean,
): string | null {
  const scale = Math.min(1, MAX_WIDTH / width);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(image.data, image.width, image.height, {
    inversionAttempts: thorough ? "attemptBoth" : "dontInvert",
  });
  return code?.data || null;
}

function cameraProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError")
    return "The camera is blocked for this site. Allow it in the browser's settings, or scan a photo.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No camera was found. Scan a photo instead.";
  if (name === "NotReadableError")
    return "Another app is using the camera. Close it and try again, or scan a photo.";
  return "The camera could not start. Scan a photo instead.";
}

/** A code read: from the camera, which sees one code many times a second, or from a photo. */
export type OnCode = (text: string, from: "camera" | "photo") => void;

export function Camera({ onCode }: { onCode: OnCode }) {
  const id = useId();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef(onCode);
  const [running, setRunning] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    latest.current = onCode;
  }, [onCode]);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setRunning(false);
  };

  useEffect(() => stop, []);

  const start = async (deviceId: string) => {
    stop();
    setProblem(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setProblem("The camera needs the page to be opened over HTTPS. Scan a photo instead.");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
        audio: false,
      });
    } catch (error) {
      setProblem(cameraProblem(error));
      return;
    }
    const v = video.current!;
    v.srcObject = stream.current;
    await v.play().catch(() => undefined);
    setRunning(true);
    // The cameras' names are known once one is allowed.
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    setCameras(devices.filter((d) => d.kind === "videoinput"));
    setCameraId(stream.current.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId);
    timer.current = setInterval(() => {
      if (v.readyState < v.HAVE_CURRENT_DATA || !canvas.current) return;
      const text = codeIn(v, v.videoWidth, v.videoHeight, canvas.current, false);
      if (text) latest.current(text, "camera");
    }, FRAME_MS);
  };

  const photo = async (file: File | undefined) => {
    if (!file || !canvas.current) return;
    setProblem(null);
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      setProblem("That file is not a picture this browser can open.");
      return;
    }
    const text = codeIn(bitmap, bitmap.width, bitmap.height, canvas.current, true);
    bitmap.close();
    if (text) latest.current(text, "photo");
    else
      setProblem(
        "No QR code was found in that photo. Take it closer, with the whole code in view.",
      );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button variant="outline" onClick={stop}>
            Stop camera
          </Button>
        ) : (
          <Button onClick={() => void start(cameraId)}>Start camera</Button>
        )}
        {cameras.length > 1 && (
          <>
            <label htmlFor={`${id}-camera`} className="text-sm">
              Camera
            </label>
            <select
              id={`${id}-camera`}
              className={field}
              value={cameraId}
              onChange={(e) => {
                setCameraId(e.target.value);
                void start(e.target.value);
              }}
            >
              {cameras.map((c, i) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </>
        )}
        <label className="text-primary cursor-pointer text-sm underline-offset-4 hover:underline">
          Scan a photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              void photo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {problem && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
      <video
        ref={video}
        aria-label="Camera"
        className={
          running ? "bg-muted aspect-video w-full max-w-md rounded-md object-cover" : "hidden"
        }
        muted
        playsInline
      />
      <canvas ref={canvas} className="hidden" />
    </div>
  );
}
