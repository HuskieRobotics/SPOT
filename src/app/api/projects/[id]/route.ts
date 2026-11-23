import { route, json, bad } from "@/lib/server/http";
import { deleteProject, getProject, getSettings, saveProject } from "@/lib/server/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(
  async (_req, { params }) => {
    const p = await getProject((await params).id);
    return p ? json(p) : bad("Project not found", 404);
  },
  { admin: true },
);

export const PUT = route<Ctx>(
  async (req, { params }) => {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body?.scouting) return bad("Invalid project");
    const current = await getProject(id);
    if (!current) return bad("Project not found", 404);
    // Optimistic concurrency: two admins editing the same project must not overwrite each other.
    if (body.revision !== undefined && body.revision !== current.revision)
      return json({ error: `Someone else saved this project (revision ${current.revision}). Reload to get their changes.`, current }, 409);
    return json(await saveProject(id, body));
  },
  { admin: true },
);

export const DELETE = route<Ctx>(
  async (_req, { params }) => {
    const { id } = await params;
    if ((await getSettings()).activeProjectId === id) return bad("You cannot delete the active project. Activate another one first.");
    await deleteProject(id);
    return json({ ok: true });
  },
  { admin: true },
);
