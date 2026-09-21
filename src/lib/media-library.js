import "server-only";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";

const { projects } = schema;

// Walk every project row and yield the media URLs it owns — poster,
// backdrop, tab covers, and each gallery item — tagged with which
// project they came from so the admin can pick from an existing asset
// instead of re-uploading. R2 doesn't need a separate list call: the DB
// already knows every URL we've ever assigned.
export async function listMediaLibrary() {
  const rows = await db
    .select({
      slug: projects.slug,
      title: projects.title,
      posterUrl: projects.posterUrl,
      bgImageUrl: projects.bgImageUrl,
      imageCoverDesktopUrl: projects.imageCoverDesktopUrl,
      imageCoverMobileUrl: projects.imageCoverMobileUrl,
      gallery: projects.gallery,
    })
    .from(projects)
    .orderBy(asc(projects.slug));

  const items = [];
  const seen = new Set();
  const push = (url, meta) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({ url, ...meta });
  };
  for (const r of rows) {
    push(r.imageCoverDesktopUrl, {
      project: r.slug,
      title: r.title,
      role: "cover-desktop",
      type: guessType(r.imageCoverDesktopUrl),
    });
    push(r.imageCoverMobileUrl, {
      project: r.slug,
      title: r.title,
      role: "cover-mobile",
      type: guessType(r.imageCoverMobileUrl),
    });
    push(r.posterUrl, {
      project: r.slug,
      title: r.title,
      role: "poster",
      type: guessType(r.posterUrl),
    });
    push(r.bgImageUrl, {
      project: r.slug,
      title: r.title,
      role: "backdrop",
      type: guessType(r.bgImageUrl),
    });
    for (const g of r.gallery ?? []) {
      // The stored type has drifted on some rows, so the filename wins —
      // it's what actually decides whether this renders as <img> or
      // <video>.
      push(g?.url, {
        project: r.slug,
        title: r.title,
        role: "gallery",
        type: guessType(g?.url),
      });
    }
  }
  return items;
}

function guessType(url) {
  if (!url) return "image";
  return /\.(mp4|mov|webm)(\?|$)/i.test(url) ? "video" : "image";
}
