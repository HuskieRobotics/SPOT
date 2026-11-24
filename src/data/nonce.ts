/**
 * A performance's nonce (DV-11): made on the device when the scouter finishes a match, so the
 * server can tell a record it already has from a new one, whichever way it arrives (synced, or
 * scanned from a QR code; #358, #360). Twelve base-36 characters, about 62 random bits.
 */
export const NONCE_LENGTH = 12;

export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}
