import { notFound } from "next/navigation";
import { getBySlug } from "@/lib/projects";
import ProjectView from "@/components/ProjectView";
import ImmersiveProjectView from "@/components/ImmersiveProjectView";

export const revalidate = 3600;

export default async function ProjectPage({ params, searchParams }) {
  const { slug } = await params;
  const { mode } = (await searchParams) ?? {};
  const p = await getBySlug(slug);
  if (!p) notFound();

  // `?mode=` lets the admin preview a layout the project hasn't been
  // saved into yet, so flipping the switch updates the preview straight
  // away. It only picks between two renderings of the same content.
  const detailMode =
    mode === "image" || mode === "immersive" ? mode : p.detailMode;

  // Immersive projects render a vertical case study built from blocks;
  // everything else keeps the horizontal card carousel.
  if (detailMode === "immersive") {
    return (
      <ImmersiveProjectView
        project={{
          slug: p.slug,
          title: p.title,
          blocks: p.blocks ?? [],
        }}
      />
    );
  }

  // Shape into what ProjectView expects. DB gallery items are stored as
  // { url, type, format } — the client component wants { video } or
  // { image } keys plus a per-item format, so we widen each entry.
  //
  // Video items get no `image` (no poster attribute on the <video>): the
  // admin never actually had a per-video cover field, only one shared
  // project-level poster, which looked wrong whenever a project had
  // several gallery videos. Leaving `poster` unset makes the browser
  // show each video's own real first frame instead — always correct,
  // no extra upload needed.
  const gallery = (p.gallery ?? []).map((g) => ({
    format: g.format ?? p.format,
    ...(g.type === "video" ? { video: g.url } : { image: g.url }),
  }));
  const project = {
    slug: p.slug,
    title: p.title,
    format: p.format,
    theme: p.theme,
    description: p.description,
    // For the info panel's "Domaine" / "Date" rows.
    category: p.category,
    year: p.year,
    // Detail-view backdrop: bg image (blurred) OR a solid colour when the
    // operator picked one instead. `image`/`imageBg` still populated for
    // legacy code paths in ProjectView.
    bgImageUrl: p.bgImageUrl,
    bgColor: p.bgColor,
    image: p.bgImageUrl ?? p.posterUrl,
    imageBg: p.bgImageUrl ?? p.posterUrl,
    video: p.imageCoverDesktopUrl ?? null,
    videoMobile: p.imageCoverMobileUrl ?? null,
    gallery,
  };

  return <ProjectView project={project} />;
}
