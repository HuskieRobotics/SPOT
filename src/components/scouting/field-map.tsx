"use client";

/**
 * The field map a position button asks for (docs/spec/05 SC-32): it covers the screen until the
 * scouter taps where the robot is. A flipped field turns it, so it matches what the scouter sees;
 * the session stores the tap turned back (SC-28).
 */
import { useRef } from "react";
import { tapOnMap } from "@/scouting/map";

export interface FieldMapProps {
  image: string;
  turned: boolean;
  onTap(tap: { x: number; y: number }): void;
}

export function FieldMap({ image, turned, onTap }: FieldMapProps) {
  const img = useRef<HTMLImageElement>(null);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
      {/* A plain img: the tap is measured against the drawn image, which next/image would wrap. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={img}
        src={image}
        alt="Field map: tap where the robot is"
        className="size-full cursor-crosshair object-contain"
        style={turned ? { transform: "rotate(180deg)" } : undefined}
        draggable={false}
        onClick={(event) => {
          const el = img.current;
          if (!el) return;
          const ratio = el.naturalHeight > 0 ? el.naturalWidth / el.naturalHeight : 0;
          onTap(tapOnMap(el.getBoundingClientRect(), ratio, event.clientX, event.clientY));
        }}
      />
    </div>
  );
}
