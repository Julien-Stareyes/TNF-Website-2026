import { NextResponse } from "next/server";

// Streams a public R2 object back through our own origin instead of
// letting the browser hit the R2 public dev domain directly.
//
// Why this exists: the immersive 3D carousel (ImmersiveCarousel3D.jsx)
// samples project covers as WebGL textures, which browsers refuse to do
// for a cross-origin video/image unless the resource is loaded with
// crossOrigin="anonymous" *and* the origin server answers every request
// (including the Range requests video playback makes) with a matching
// Access-Control-Allow-Origin header. We don't have access to configure
// CORS on the R2 bucket itself (inherited project, no dashboard access),
// so instead we fetch the object server-side, here, and hand it back
// same-origin -- no CORS negotiation needed at all once that's true, and
// crossOrigin can even come off the <video>/<img> tags.
//
// Range support matters: without forwarding the client's Range header
// and returning a matching 206, video playback would have to download
// the entire (often 50-100MB+) file before it could start, instead of
// seeking/streaming progressively like a normal <video src>.
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const { path } = await params;
  const key = (path ?? []).join("/");
  if (!key) return NextResponse.json({ error: "missing path" }, { status: 400 });

  const upstreamUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

  const range = request.headers.get("range");
  const upstreamRes = await fetch(upstreamUrl, {
    headers: range ? { Range: range } : {},
    // Object bodies are large media files -- never let Next cache them
    // in a route handler's fetch cache.
    cache: "no-store",
  });

  if (!upstreamRes.ok && upstreamRes.status !== 206) {
    return NextResponse.json(
      { error: "upstream fetch failed", status: upstreamRes.status },
      { status: upstreamRes.status || 502 },
    );
  }

  const headers = new Headers();
  const passthrough = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
    "cache-control",
  ];
  for (const h of passthrough) {
    const v = upstreamRes.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  }
  headers.set("accept-ranges", "bytes");

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    headers,
  });
}
