/**
 * Drawing a match code (#358; OF-6: the `qrcode` library is bundled into the app, so it works
 * offline). Error correction M, and the alphanumeric mode the Base45 text was made for.
 */
import QRCode from "qrcode";

const options = { errorCorrectionLevel: "M" } as const;

/** The code as SVG text. */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString([{ data: text, mode: "alphanumeric" }], {
    ...options,
    type: "svg",
    margin: 2,
  });
}

/** The QR version (1 to 40) the text needs: 21 modules a side at 1, 4 more for each step. */
export function qrVersion(text: string): number {
  return QRCode.create([{ data: text, mode: "alphanumeric" }], options).version;
}
