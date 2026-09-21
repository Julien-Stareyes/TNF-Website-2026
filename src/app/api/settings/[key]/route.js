import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAuthed } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";

// GET  /api/settings/:key           → returns { key, value }
// PATCH /api/settings/:key          → body becomes the new value (upsert)
export async function GET(_req, { params }) {
  const { key } = await params;
  const value = await getSetting(key);
  return NextResponse.json({ key, value });
}

export async function PATCH(req, { params }) {
  if (!(await isAuthed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await params;
  const value = await req.json();
  await setSetting(key, value);
  if (key === "landing") revalidatePath("/");
  if (key === "info") revalidatePath("/info");
  if (key === "immersive") revalidatePath("/immersive");
  if (key === "tabs") {
    // The header reads tab state in the root layout, so every page's
    // nav changes with it.
    revalidatePath("/", "layout");
  }
  return NextResponse.json({ key, value });
}
