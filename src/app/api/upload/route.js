import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { presignPut } from "@/lib/r2";
import { buildKey } from "@/lib/upload-keys";

// POST /api/upload
// Body: {
//   slug: 'prada-magazine',        // project slug
//   role: 'cover-desktop' | 'cover-mobile' | 'cover-blur' | 'poster' | 'gallery' | 'immersive' | 'landing' | 'logo',
//   contentType: 'video/mp4',
//   ext: 'mp4',                    // file extension (no dot)
//   tab: 'image' | 'immersive',    // required for role='cover-desktop'/'cover-mobile'
// }
// Returns { url, key, publicUrl } — client PUTs the file to `url`.
export async function POST(req) {
  if (!(await isAuthed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug, role, contentType, ext, tab } = await req.json();
  if (!slug || !role || !contentType || !ext) {
    return NextResponse.json(
      { error: "slug, role, contentType, ext required" },
      { status: 400 }
    );
  }

  const key = buildKey({ slug, role, ext, tab });
  const signed = await presignPut(key, contentType);
  return NextResponse.json(signed);
}
