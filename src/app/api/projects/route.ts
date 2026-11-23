import { route, json, bad } from "@/lib/server/http";
import { createProject, getSettings, listProjects } from "@/lib/server/store";
import { listPresets, loadPreset } from "@/lib/server/presets";
import { projectFromLegacy } from "@/lib/project/legacy";
import type { ProjectInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(
  async () => {
    // Settings first: on first run it seeds the preset projects.
    const settings = await getSettings();
    const projects = await listProjects();
    return json({ projects, presets: listPresets(), activeProjectId: settings.activeProjectId });
  },
  { admin: true },
);

/**
 * Create a project. Body is one of:
 *  { preset: "2026" }                                   built-in template
 *  { project: {...} }                                   a SPOT v6 project export
 *  { legacy: { matchScouting, pipeline?, modules?, scoring? }, name }   legacy v1–v5 JSON files
 */
export const POST = route(
  async (req) => {
    const body = await req.json().catch(() => null);
    if (!body) return bad("Missing body");
    let input: ProjectInput;
    if (body.preset) input = loadPreset(String(body.preset));
    else if (body.project) input = body.project;
    else if (body.legacy?.matchScouting) {
      if (!body.legacy.matchScouting.layout?.layers) return bad("That match-scouting.json has no layout.layers.");
      input = projectFromLegacy({ name: body.name || "Imported project", season: body.season || "", ...body.legacy });
    } else return bad("Provide preset, project or legacy files");
    if (body.name) input.name = String(body.name);
    return json(await createProject(input), 201);
  },
  { admin: true },
);
