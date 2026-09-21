"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { EditModeProvider, Editable, useEditMode } from "@/lib/edit-mode";
import { markMuted } from "@/lib/muted-video";

// Immersive tab -- a static grid of project cards, each with a muted
// autoplay video sitting dim and desaturated behind the copy until you
// hover it (see the `.tnf-imm-*` rules in globals.css for the animation
// itself: grayscale + low opacity by default, full colour + a slight
// zoom on hover, the card lifting a few px, a ghost index number blended
// over the top). This replaces the previous step-through 3D carousel
// (still on disk as ImmersiveCarousel.jsx, unused) with a plain grid.
export default function ImmersiveGrid({ projects, intro: initialIntro }) {
  const [intro, setIntro] = useState(initialIntro);

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === "tnf-preview:immersive" && e.data.payload)
        setIntro(e.data.payload.intro ?? "");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <EditModeProvider>
      <GridView projects={projects} intro={intro} />
    </EditModeProvider>
  );
}

function GridView({ projects, intro }) {
  const { enabled } = useEditMode();

  return (
    <section className="relative min-h-screen bg-white text-black">
      <SiteHeader theme="light" />

      <div className="px-5 md:px-[3vw] pt-[22vh] md:pt-[20vh] pb-[14vh]">
        {/* Intro copy, same spot/field as the previous carousel view. */}
        <div className="max-w-[80vw] md:max-w-[28vw] mb-10 md:mb-14">
          <Editable
            as="p"
            multiline
            field="intro"
            value={intro}
            className="font-mono leading-[1.6] text-[12px] md:text-[0.78vw]"
            placeholder={enabled ? "Intro copy" : undefined}
          />
        </div>

        {projects.length === 0 ? (
          <div className="grid place-items-center py-40 font-mono text-sm text-black/40">
            No immersive projects yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((p, i) => (
              <Card key={p.slug} project={p} index={i + 1} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Card({ project, index }) {
  return (
    <Link
      href={`/${project.slug}`}
      className="tnf-imm-card group relative flex flex-col overflow-hidden min-h-[360px] md:min-h-[400px] p-7 md:p-8"
    >
      <CardMedia project={project} />
      <span className="tnf-imm-scrim" aria-hidden="true" />
      <span className="tnf-imm-index" aria-hidden="true">
        {String(index).padStart(2, "0")}
      </span>

      <h3 className="relative z-[1] mt-auto font-mono uppercase tracking-[0.08em] text-[20px] md:text-[26px] leading-[1.1]">
        {project.title}
      </h3>
      <div className="relative z-[1] mt-3 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-black/45">
        <span>T.N.F</span>
        <span className="tabular-nums">{project.year ?? ""}</span>
      </div>

      <div className="relative z-[1] mt-6">
        <span className="tnf-imm-action">
          View project
          <svg
            className="tnf-imm-action-arrow"
            width="16"
            height="9"
            viewBox="0 0 18 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          >
            <path d="M0 5h16M12 1l4 4-4 4" />
          </svg>
        </span>
      </div>
    </Link>
  );
}

// Same media-picking logic as the old carousel cards, minus the
// centre-tracking play/pause -- every card in a static grid can just
// autoplay, muted, and sit quietly until it's hovered.
function CardMedia({ project }) {
  const video = project.video ?? null;
  const image = project.image ?? null;
  const attach = useCallback((el) => markMuted(el), []);

  if (video) {
    return (
      <video
        ref={attach}
        src={`${video}#t=0.1`}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="tnf-imm-media"
        aria-hidden="true"
      />
    );
  }
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className="tnf-imm-media" aria-hidden="true" />
    );
  }
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/[0.03]" aria-hidden="true">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/25">
        No media yet
      </span>
    </div>
  );
}
