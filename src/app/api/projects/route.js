import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAuthed } from "@/lib/auth";
import {
  createProject,
  listAll,
  listForTab,
} from "@/lib/projects";

// GET /api/projects?tab=image  → public read (tab list)
// GET /api/projects            → admin (all projects with tab memberships)
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab");
  if (tab) return NextResponse.json(await listForTab(tab));
  if (!(await isAuthed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listAll());
}

export async function POST(req) {
  if (!(await isAuthed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.slug || !body.title) {
    return NextResponse.json(
      { error: "slug and title required" },
      { status: 400 }
    );
  }
  const row = await createProject(body);
  // Image is the homepage now -- a new project lands on the "image" tab,
  // which is served from "/", not "/image" (that route just redirects).
  revalidatePath("/");
  revalidatePath("/image");
  return NextResponse.json(row, { status: 201 });
}
