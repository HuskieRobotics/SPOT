import { route, json } from "@/lib/server/http";
import { adminStart } from "@/lib/server/registry";

export const dynamic = "force-dynamic";

/** Send every assigned, waiting scouter into the match now. */
export const POST = route(async () => json({ entered: adminStart() }), { admin: true });
