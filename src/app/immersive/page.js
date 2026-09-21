import { listForTab } from "@/lib/projects";
import ComingSoon from "@/components/ComingSoon";
import ParkedNotice from "@/components/ParkedNotice";
import { isAuthed } from "@/lib/auth";
import { getImmersive, getTabStates } from "@/lib/settings";
import ImmersiveCarousel3D from "@/components/ImmersiveCarousel3D";

export const revalidate = 3600;

// Routes an R2 public URL through our own /api/media-proxy instead of
// straight to the R2 dev domain -- see that route for why: the 3D
// carousel needs these as WebGL textures, which requires CORS headers
// we can't add on the R2 bucket itself (inherited project, no dashboard
// access), so we make the request same-origin instead.
const R2_PUBLIC = process.env.R2_PUBLIC_URL;
function toProxyUrl(url) {
  if (!url || !R2_PUBLIC || !url.startsWith(R2_PUBLIC)) return url;
  const key = url.slice(R2_PUBLIC.length).replace(/^\//, "");
  return `/api/media-proxy/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export default async function ImmersivePage() {
  // Parked from the admin. The public gets a holding screen; a
  // signed-in operator still sees the real section, so it stays
  // editable in the preview while it's offline. Reading the session
  // here also opts the route out of static caching, so the operator's
  // view can never be served to a visitor.
  const parked = (await getTabStates())["immersive"] !== "live";
  if (parked && !(await isAuthed())) return <ComingSoon title="Immersive" />;

  const [rows, settings] = await Promise.all([
    listForTab("immersive"),
    getImmersive(),
  ]);

  const projects = rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    year: r.year,
    category: r.category,
    // Cards prefer a moving cover, then any still that represents the
    // project. Cards with nothing yet render a placeholder.
    video: toProxyUrl(
      r.imageCoverDesktopUrl ??
        (r.gallery ?? []).find((g) => g.type === "video")?.url ??
        null,
    ),
    image: toProxyUrl(
      r.posterUrl ??
        r.bgImageUrl ??
        (r.gallery ?? []).find((g) => g.type !== "video")?.url ??
        null,
    ),
  }));

  return (
    <>
      <ImmersiveCarousel3D projects={projects} intro={settings.intro} />
      {parked && <ParkedNotice />}
    </>
  );
}
