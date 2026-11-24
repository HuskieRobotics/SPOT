/**
 * Packing whole numbers into bits, most significant first, and reading them back (DM-15). Fields
 * up to 96 bits wide go through BigInt, so a wide field (an event id) needs no special case.
 */

export class BitWriter {
  private readonly bits: number[] = [];

  /** Append `value` in `width` bits. The caller has checked it fits. */
  write(value: number | bigint, width: number): void {
    const v = BigInt(value);
    if (v < BigInt(0) || v >= BigInt(1) << BigInt(width))
      throw new RangeError(`${value} does not fit in ${width} bits`);
    for (let i = width - 1; i >= 0; i--) this.bits.push(Number((v >> BigInt(i)) & BigInt(1)));
  }

  get length(): number {
    return this.bits.length;
  }

  /** The bits so far, padded with zeros to whole bytes. */
  bytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((bit, i) => {
      if (bit) out[i >> 3] |= 0x80 >> (i & 7);
    });
    return out;
  }
}

export class BitReader {
  private at = 0;

  constructor(private readonly data: Uint8Array) {}

  /** Bits not yet read, padding included. */
  get remaining(): number {
    return this.data.length * 8 - this.at;
  }

  readBig(width: number): bigint {
    if (width > this.remaining) throw new RangeError("the code ends too soon");
    let v = BigInt(0);
    for (let i = 0; i < width; i++, this.at++)
      v = (v << BigInt(1)) | BigInt((this.data[this.at >> 3] >> (7 - (this.at & 7))) & 1);
    return v;
  }

  read(width: number): number {
    return Number(this.readBig(width));
  }
}

/** Bits to number `count` things (0 to count − 1); at least 1, so a field always exists. */
export function bitsFor(count: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(count, 1))));
}
