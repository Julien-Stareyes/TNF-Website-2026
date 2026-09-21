import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { putObject } from "@/lib/r2";
import { buildKey } from "@/lib/upload-keys";

// POST /api/upload-proxy
// multipart/form-data: file, slug, role, ext, contentType, tab?
// Returns { url, key, publicUrl } -- unlike /api/upload (which hands the
// browser a presigned URL to PUT straight to R2), this route takes the
// bytes itself and uploads them to R2 server-side.
//
// Why both exist: the R2 bucket has no CORS policy configured (inherited
// project, no dashboard access to add one), so a direct browser PUT to a
// presigned URL fails its cross-origin preflight. Routing small uploads
// through our own server sidesteps that entirely -- same-origin all the
// way, the same fix /api/media-proxy applies on the read side. It's
// opt-in (UploadField's `viaProxy` prop) rather than the default,
// because it puts every byte through the app server instead of straight
// to R2, which doesn't suit the large video uploads elsewhere in the
// admin (project covers, immersive assets).
export async function POST(req) {
  if (!(await isAuthed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const slug = form.get("slug");
  const role = form.get("role");
  const tab = form.get("tab") || undefined;
  const ext = form.get("ext");
  const contentType = form.get("contentType") || file?.type || "application/octet-stream";

  if (!file || !slug || !role || !ext) {
    return NextResponse.json(
      { error: "file, slug, role, ext required" },
      { status: 400 }
    );
  }

  const key = buildKey({ slug, role, ext, tab });
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await putObject(key, bytes, contentType);
  return NextResponse.json(result);
}
