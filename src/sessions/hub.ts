/**
 * The open server-sent event streams, by scouter (ADR 0001, docs/spec/15 Part 1).
 *
 * A device holds one stream; a scouter can briefly have two (a reload opens the new one before
 * the old one closes), so the scouter counts as disconnected only when their last stream closes.
 * A heartbeat comment keeps proxies from closing a quiet stream and lets the server notice a
 * dead one: a write that fails closes it (docs/spec/15, condition 1).
 */
import type { DeviceMessage } from "./registry";

const encoder = new TextEncoder();

/** How often an idle stream gets a heartbeat. Below nginx's and Cloud Run's idle limits. */
export const HEARTBEAT_MS = 20_000;
/** How long the browser waits before reconnecting a dropped stream (`retry:`). */
export const RETRY_MS = 3_000;

export function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export interface Connection {
  scouterId: string;
  deviceId: string;
  write(chunk: Uint8Array): boolean;
  close(): void;
}

export class Hub {
  private readonly byScouter = new Map<string, Set<Connection>>();

  /** Wrap a stream controller as a connection that cleans up after itself. */
  connect(
    scouterId: string,
    deviceId: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
    onClosed: (connection: Connection) => void,
    heartbeatMs = HEARTBEAT_MS,
  ): Connection {
    let open = true;
    const connection: Connection = {
      scouterId,
      deviceId,
      write: (chunk) => {
        if (!open) return false;
        try {
          controller.enqueue(chunk);
          return true;
        } catch {
          connection.close();
          return false;
        }
      },
      close: () => {
        if (!open) return;
        open = false;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // Already closed by the browser going away.
        }
        onClosed(connection);
      },
    };
    // Before the first write, so `close` always has a timer to clear.
    const timer = setInterval(() => connection.write(encoder.encode(": ping\n\n")), heartbeatMs);
    timer.unref?.();
    connection.write(encoder.encode(`retry: ${RETRY_MS}\n\n`));
    let set = this.byScouter.get(scouterId);
    if (!set) this.byScouter.set(scouterId, (set = new Set()));
    set.add(connection);
    return connection;
  }

  /** Forget a closed connection. True if it was the scouter's last. */
  forget(connection: Connection): boolean {
    const set = this.byScouter.get(connection.scouterId);
    if (!set) return true;
    set.delete(connection);
    if (set.size > 0) return false;
    this.byScouter.delete(connection.scouterId);
    return true;
  }

  isConnected(scouterId: string): boolean {
    return (this.byScouter.get(scouterId)?.size ?? 0) > 0;
  }

  send(scouterId: string, message: DeviceMessage) {
    for (const c of [...(this.byScouter.get(scouterId) ?? [])]) {
      c.write(sseEvent(message.kind, message));
      // A signed-out device must not reconnect (docs/spec/15, condition 3).
      if (message.kind === "signed-out") c.close();
    }
  }

  /** Send a message to every open stream. */
  broadcast(message: DeviceMessage) {
    for (const scouterId of [...this.byScouter.keys()]) this.send(scouterId, message);
  }

  /** Sign out the scouter's other devices, after they signed in on `deviceId`. */
  signOutOtherDevices(scouterId: string, deviceId: string) {
    for (const c of [...(this.byScouter.get(scouterId) ?? [])])
      if (c.deviceId !== deviceId) {
        c.write(sseEvent("signed-out", { kind: "signed-out" }));
        c.close();
      }
  }

  signOutAll() {
    for (const set of [...this.byScouter.values()])
      for (const c of [...set]) {
        c.write(sseEvent("signed-out", { kind: "signed-out" }));
        c.close();
      }
  }
}
