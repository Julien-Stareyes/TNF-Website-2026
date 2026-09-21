import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAuthed } from "@/lib/auth";
import { deleteProject, updateProject } from "@/lib/projects";

export async function PATCH(req, { params }) {
  if (!(await isAuthed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const patch = await req.json();
  const row = await updateProject(id, patch);
  revalidateAllTabs(row?.slug);
  return NextResponse.json(row);
}

export async function DELETE(req, { params }) {
  if (!(await isAuthed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteProject(id);
  revalidateAllTabs();
  return NextResponse.json({ ok: true });
}

function revalidateAllTabs(slug) {
  revalidatePath("/");
  revalidatePath("/image");
  revalidatePath("/immersive");
  revalidatePath("/archive");
  if (slug) revalidatePath(`/${slug}`);
}
