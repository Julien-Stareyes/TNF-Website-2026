import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAuthed } from "@/lib/auth";
import { reorderTab, reorderIndex } from "@/lib/projects";

// POST /api/projects/reorder
// Body: { tab: 'image'|'immersive'|'index', ids: [projectId1, projectId2, ...] }
// "index" writes projects.index_position directly (no membership table
// for that tab); image/immersive still go through project_tabs.
export async function POST(req) {
  if (!(await isAuthed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tab, ids } = await req.json();
  if (!tab || !Array.isArray(ids)) {
    return NextResponse.json(
      { error: "tab and ids[] required" },
      { status: 400 }
    );
  }
  if (tab !== "image" && tab !== "immersive" && tab !== "index") {
    return NextResponse.json(
      { error: "only image/immersive/index can be reordered" },
      { status: 400 }
    );
  }
  if (tab === "index") {
    await reorderIndex(ids);
    revalidatePath("/archive");
    revalidatePath("/archive-v2");
    return NextResponse.json({ ok: true });
  }
  await reorderTab(tab, ids);
  // "image" is served from "/" now (the homepage), not "/image" -- that
  // route is just a redirect, but revalidating it too is harmless.
  revalidatePath(tab === "image" ? "/" : `/${tab}`);
  if (tab === "image") revalidatePath("/image");
  return NextResponse.json({ ok: true });
}
