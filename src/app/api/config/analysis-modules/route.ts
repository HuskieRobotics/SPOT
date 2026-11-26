/**
 * The active season's analysis-modules.json for the analysis dashboard (docs/spec/20 CS-17, #382):
 * `GET /api/config/analysis-modules` → `{ version, config, findings }`, with the version as the
 * `ETag` (304 when unchanged). Refused with 503 only when the file can't be used at all;
 * otherwise `findings` lists what config:check finds in it (src/config/serve.ts).
 *
 * Not behind the join code: anyone may read the dashboard's configuration (SEC-1).
 */
import { analysisFileResponse } from "@/config/serve";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return analysisFileResponse(request, "analysis-modules");
}
