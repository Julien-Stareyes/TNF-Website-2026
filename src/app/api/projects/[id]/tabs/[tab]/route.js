import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAuthed } from "@/lib/auth";
import { removeTabMembership, upsertTabMembership } from "@/lib/projects";

// "image" is served from "/" now (the homepage) -- "/image" itself is
// just a redirect, so a tab-membership change on it has to revalidate
// "/", not "/image".
function revalidateTab(tab) {
  revalidatePath(tab === "image" ? "/" : `/${tab}`);
  if (tab === "image") revalidatePath("/image");
}

// PATCH /api/projects/:id/tabs/:tab   → add-or-update tab membership
// DELETE                              → remove from tab
export async function PATCH(req, { params }) {
  if (!(await isAuthed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, tab } = await params;
  const body = await req.json().catch(() => ({}));
  await upsertTabMembership(id, tab, {
    position: body.position ?? 0,
    published: body.published ?? true,
  });
  revalidateTab(tab);
  revalidatePath("/archive");
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  if (!(await isAuthed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, tab } = await params;
  await removeTabMembership(id, tab);
  revalidateTab(tab);
  return NextResponse.json({ ok: true });
}
