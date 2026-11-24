/** Reading a server-sent event stream in tests, as it arrives (#354). */
import type { DeviceMessage } from "@/sessions/registry";

export interface SseEvent {
  event: string;
  data: DeviceMessage;
}

/** Reads a server-sent event stream as it arrives. */
export class StreamReader {
  private buffer = "";
  readonly raw: string[] = [];
  private readonly events: SseEvent[] = [];
  done = false;
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();

  constructor(body: ReadableStream<Uint8Array>) {
    this.reader = body.getReader();
  }

  private async pull(): Promise<boolean> {
    if (this.done) return false;
    const { value, done } = await this.reader.read();
    if (done) {
      this.done = true;
      return false;
    }
    const text = this.decoder.decode(value);
    this.raw.push(text);
    this.buffer += text;
    let i: number;
    while ((i = this.buffer.indexOf("\n\n")) >= 0) {
      const block = this.buffer.slice(0, i);
      this.buffer = this.buffer.slice(i + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data) this.events.push({ event, data: JSON.parse(data) });
    }
    return true;
  }

  /** The next event, waiting for it to arrive; null once the stream has ended. */
  async next(timeoutMs = 2000): Promise<SseEvent | null> {
    const deadline = Date.now() + timeoutMs;
    while (this.events.length === 0) {
      if (Date.now() > deadline) throw new Error("no event arrived");
      if (!(await Promise.race([this.pull(), sleep(timeoutMs).then(() => true)]))) return null;
    }
    return this.events.shift()!;
  }

  /** Every event up to now, without waiting for more than a moment. */
  async drain(): Promise<SseEvent[]> {
    const out: SseEvent[] = [];
    for (;;) {
      try {
        const e = await this.next(100);
        if (!e) return out;
        out.push(e);
      } catch {
        return out;
      }
    }
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
