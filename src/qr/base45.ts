/**
 * Base45 (RFC 9285): bytes as text drawn from the 45 characters of a QR code's alphanumeric mode,
 * which stores 11 bits per two characters. Two bytes become three characters, so a payload costs
 * about 3% more than raw bytes, against 33% for base64 in byte mode. The text also survives any
 * scanner, where raw bytes may be decoded as text and changed.
 */

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export function toBase45(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      let n = bytes[i] * 256 + bytes[i + 1];
      for (let k = 0; k < 3; k++, n = Math.floor(n / 45)) out += ALPHABET[n % 45];
    } else {
      const n = bytes[i];
      out += ALPHABET[n % 45] + ALPHABET[Math.floor(n / 45)];
    }
  }
  return out;
}

/** The bytes, or null if the text is not Base45. */
export function fromBase45(text: string): Uint8Array | null {
  if (text.length % 3 === 1) return null;
  const digits = [...text].map((c) => ALPHABET.indexOf(c));
  if (digits.some((d) => d < 0)) return null;
  const out: number[] = [];
  for (let i = 0; i < digits.length; i += 3) {
    if (i + 2 < digits.length) {
      const n = digits[i] + digits[i + 1] * 45 + digits[i + 2] * 45 * 45;
      if (n > 0xffff) return null;
      out.push(n >> 8, n & 0xff);
    } else {
      const n = digits[i] + digits[i + 1] * 45;
      if (n > 0xff) return null;
      out.push(n);
    }
  }
  return Uint8Array.from(out);
}
