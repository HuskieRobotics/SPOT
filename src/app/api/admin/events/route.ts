import { route, json, bad } from "@/lib/server/http";
import { ensureEvent, listEvents, updateSettings } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Create (or find) an event code "<tbaKey>_<label>" and optionally make it the active event. */
export const POST = route(
  async (req) => {
    const { code, activate } = await req.json().catch(() => ({}));
    const c = String(code ?? "").trim();
    if (!/^[0-9]{4}[a-z0-9]+_[A-Za-z0-9-]+$/.test(c)) return bad('Event codes look like "2026mnwi_official" (TBA key, underscore, label).');
    const ev = await ensureEvent(c);
    if (activate) await updateSettings({ activeEventId: ev._id, tbaEventKey: c.split("_")[0] });
    return json({ event: ev, events: await listEvents() }, 201);
  },
  { admin: true },
);
