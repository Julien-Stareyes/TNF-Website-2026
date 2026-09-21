import { listForTab } from "@/lib/projects";
import ComingSoon from "@/components/ComingSoon";
import ParkedNotice from "@/components/ParkedNotice";
import { isAuthed } from "@/lib/auth";
import { getTabStates } from "@/lib/settings";
import ScrollScramble from "@/components/ScrollScramble";

// The site now opens directly on the Image tab -- this used to be the
// showreel landing page (Landing.jsx), moved to `/image`. That route is
// now just a redirect back here (see src/app/image/page.js) so old links
// still land somewhere real. Landing.jsx and its `getLanding` settings
// are left on disk, unused, in case the showreel homepage is wanted back
// -- same convention as this codebase's other retired-but-kept variants.
//
// Revalidate on-demand via revalidatePath('/') from the admin edits, so
// the list-view carousel is served from the ISR cache but stays fresh
// when curators tweak content.
export const revalidate = 3600;

export default async function Home() {
  // Parked from the admin. The public gets a holding screen; a
  // signed-in operator still sees the real section, so it stays
  // editable in the preview while it's offline. Reading the session
  // here also opts the route out of static caching, so the operator's
  // view can never be served to a visitor.
  const parked = (await getTabStates())["image"] !== "live";
  if (parked && !(await isAuthed())) return <ComingSoon title="Image" />;

  const rows = await listForTab("image");

  // Map DB rows into the shape ScrollScramble expects. Missing covers fall
  // back to the poster or a placeholder so nothing crashes for a project
  // whose media isn't uploaded yet.
  const projects = rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    // The cursor-following label (ScrollScramble's CursorLabel) reads
    // this instead of title -- falls back to title for any project
    // saved before the field existed.
    brand: r.brand || r.title,
    format: r.format,
    imageFullScreen: r.imageFullScreen,
    theme: r.theme,
    image: r.posterUrl,
    imageMobile: r.posterMobileUrl,
    imageBg: r.posterUrl,
    video: r.imageCoverDesktopUrl,
    videoMobile: r.imageCoverMobileUrl,
    videoBlur: r.imageCoverBlurUrl,
    description: r.description,
    gallery: r.gallery ?? [],
  }));

  return (
    <>
      <ScrollScramble projects={projects} />
      {parked && <ParkedNotice />}
    </>
  );
}
