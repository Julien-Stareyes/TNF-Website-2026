import { listForTab } from "@/lib/projects";
import ComingSoon from "@/components/ComingSoon";
import ParkedNotice from "@/components/ParkedNotice";
import { isAuthed } from "@/lib/auth";
import { getTabStates } from "@/lib/settings";
import IndexYardHover from "@/components/IndexYardHover";

export const revalidate = 3600;

export default async function IndexPage() {
  // Parked from the admin. The public gets a holding screen; a
  // signed-in operator still sees the real section, so it stays
  // editable in the preview while it's offline. Reading the session
  // here also opts the route out of static caching, so the operator's
  // view can never be served to a visitor.
  const parked = (await getTabStates())["index"] !== "live";
  if (parked && !(await isAuthed())) return <ComingSoon title="Index" />;

  const rows = await listForTab("index");

  // Only the fields the Index table needs — keeps client bundle lean.
  const projects = rows
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      year: r.year,
      // The last two columns, shown exactly as typed in the admin.
      category: r.category ?? "",
      technologies: r.technologies ?? "",
      // Preview media: only ever the project's first gallery item,
      // whatever it is -- image or video, any format. No fallback to the
      // Image-tab cover/poster/backdrop; if there is no gallery item, the
      // row just shows a plain white background (see IndexYardHover.jsx).
      previewUrl: r.gallery?.[0]?.url ?? null,
      previewType: r.gallery?.[0]?.type ?? "image",
    }))
    .sort((a, b) => {
      // Latest year first, alphabetical inside a year.
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
