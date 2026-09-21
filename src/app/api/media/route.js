import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { listMediaLibrary } from "@/lib/media-library";

// GET /api/media — admin-only browsable list of every media asset
// referenced anywhere in the project catalogue.
export async function GET() {
  if (!(await isAuthed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await listMediaLibrary();
  return NextResponse.json(items);
}
