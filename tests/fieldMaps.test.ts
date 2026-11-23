import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MAX_MAP_BYTES, inspectUpload, isValidMapUrl, normalizeImageSrc } from "@/lib/fieldMaps";

const bytes = (s: string) => new TextEncoder().encode(s);
const root = path.resolve(__dirname, "..");

describe("field map upload checks", () => {
  it("accepts the bundled field SVGs", () => {
    for (const f of ["public/img/field.svg", "public/img/half-field.svg"]) {
      const r = inspectUpload(new Uint8Array(fs.readFileSync(path.join(root, f))));
      expect(r).toEqual({ ok: true, contentType: "image/svg+xml" });
    }
  });

  it("recognises PNG, JPEG and WebP by their bytes, not their name", () => {
    expect(inspectUpload(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toEqual({ ok: true, contentType: "image/png" });
    expect(inspectUpload(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toEqual({ ok: true, contentType: "image/jpeg" });
    expect(inspectUpload(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toEqual({ ok: true, contentType: "image/webp" });
  });

  it("rejects SVGs that could run code", () => {
    for (const evil of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe/></foreignObject></svg>',
      '<!DOCTYPE svg [<!ENTITY a "b">]><svg xmlns="http://www.w3.org/2000/svg"/>',
    ]) {
      const r = inspectUpload(bytes(evil));
      expect(r.ok, evil).toBe(false);
    }
  });

  it("rejects empty, oversized and non-image files", () => {
    expect(inspectUpload(new Uint8Array()).ok).toBe(false);
    expect(inspectUpload(new Uint8Array(MAX_MAP_BYTES + 1).fill(0x41)).ok).toBe(false);
    expect(inspectUpload(bytes("hello world")).ok).toBe(false);
    expect(inspectUpload(bytes("<html><body>not an svg</body></html>")).ok).toBe(false);
  });
});

describe("field map addresses", () => {
  it("validates urls and normalises legacy paths", () => {
    expect(isValidMapUrl("https://example.org/field.png")).toBe(true);
    expect(isValidMapUrl("javascript:alert(1)")).toBe(false);
    expect(isValidMapUrl("https://a b")).toBe(false);
    expect(normalizeImageSrc("img/half-field.svg")).toBe("/img/half-field.svg");
    expect(normalizeImageSrc("/api/field-maps/1/image")).toBe("/api/field-maps/1/image");
    expect(normalizeImageSrc("https://x.org/a.png")).toBe("https://x.org/a.png");
  });
});
