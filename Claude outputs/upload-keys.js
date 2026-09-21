import { nanoid } from "nanoid";

// Object key layout, per docs/README:
//   projects/<slug>/{uuid}.<ext>                       role=gallery
//   projects/<slug>/image/cover-desktop.<ext>          role=cover-desktop
//   projects/<slug>/image/cover-mobile.<ext>           role=cover-mobile
//   projects/<slug>/poster.<ext>                       role=poster
//   projects/<slug>/immersive/{uuid}.<ext>             role=immersive
//   site/landing/{uuid}.<ext>                          role=landing
//   site/logos/{uuid}.<ext>                            role=logo
// Shared by /api/upload (presigned browser-to-R2 PUT) and
// /api/upload-proxy (server-side PUT, for roles that can't rely on the
// R2 bucket's CORS policy) so the two paths can never drift apart.
export function buildKey({ slug, role, ext, tab }) {
  // Site-level assets live outside the projects/ tree — landing showreel,
  // the Info page's client-logo strip, etc.
  if (role === "landing") return `site/landing/${nanoid(10)}.${ext}`;
  if (role === "logo") return `site/logos/${nanoid(10)}.${ext}`;
  const base = `projects/${slug}`;
  switch (role) {
    case "cover-desktop":
      return `${base}/${tab || "image"}/cover-desktop.${ext}`;
    case "cover-mobile":
      return `${base}/${tab || "image"}/cover-mobile.${ext}`;
    case "cover-blur":
      return `${base}/${tab || "image"}/cover-blur.${ext}`;
    case "poster":
      return `${base}/poster.${ext}`;
    case "gallery":
      return `${base}/${nanoid(10)}.${ext}`;
    case "immersive":
      return `${base}/immersive/${nanoid(10)}.${ext}`;
    default:
      throw new Error(`unknown role: ${role}`);
  }
}
