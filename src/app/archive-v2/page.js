import { listForTab } from "@/lib/projects";
import ComingSoon from "@/components/ComingSoon";
import ParkedNotice from "@/components/ParkedNotice";
import { isAuthed } from "@/lib/auth";
import { getTabStates } from "@/lib/settings";
import IndexYardHover from "@/components/IndexYardHover";

// Test route for the Index page -- same data and parked/auth gating as
// /archive (see that route), rendered through IndexYardHover so this
// interaction idea can be compared against /archive before picking one.
export const revalidate = 3600;

export default async function IndexPageV2() {
  const parked = (await getTabStates())["index"] !== "live";
  if (parked && !(await isAuthed())) return <ComingSoon title="Index" />;

  const rows = await listForTab("index");

  const projects = rows
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      year: r.year,
      category: r.category ?? "",
      technologies: r.technologies ?? "",
      previewUrl:
        r.imageCoverDesktopUrl ??
        r.posterUrl ??
        r.bgImageUrl ??
        r.gallery?.[0]?.url ??
        null,
      previewType: r.imageCoverDesktopUrl
        ? "video"
        : r.posterUrl || r.bgImageUrl
        ? "image"
        : r.gallery?.[0]?.type ?? "image",
    }))
    .sort((a, b) => {
      if ((b.year ?? 0) !== (a.year ?? 0)) return (b.year ?? 0) - (a.year ?? 0);
      return a.title.localeCompare(b.title);
    });

  return (
    <>
      <IndexYardHover projects={projects} />
      {parked && <ParkedNotice />}
    </>
  );
}
