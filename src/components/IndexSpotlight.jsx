"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import SiteHeader from "@/components/SiteHeader";
import { markMuted } from "@/lib/muted-video";

// Ported from a reference demo: a pinned "spotlight" section that scrubs
// through the project list as the page scrolls -- a running index counter
// and the stack of preview images both drift upward together, in sync,
// while the current project's name is shown front and center.
//
// The reference kept every name in the DOM at once and gave each its own
// GSAP offset, tuned for its fixed 10-item list. TNF has many more
// projects than that, and once several names are simultaneously "already
// passed" they all resolve to the exact same offset (the math only tracks
// one shared distance, not a per-item rest position), which piled every
// passed title on top of each other instead of letting them scroll off.
// A list sized for 10 doesn't hit that; a list sized for TNF's full
// catalogue does. Showing just the current name -- swapped in like the
// counter's text -- sidesteps it entirely and works for any project count.
//
// `gsap.set` writes the moving pieces directly (no React state per frame,
// same imperative-paint pattern already used in ScrollScramble.jsx) --
// ScrollTrigger itself is registered once, globally, by
// SmoothScroll/Lenis.jsx, so this only needs to build the one trigger for
// its own section and tear it down on unmount/data change.
gsap.registerPlugin(ScrollTrigger);

export default function IndexSpotlight({ projects }) {
  const spotlightRef = useRef(null);
  const indexRef = useRef(null);
  const imagesContainerRef = useRef(null);
  const nameWrapRef = useRef(null);
  const nameRef = useRef(null);
  const yearRef = useRef(null);
  const imgRefs = useRef([]);

  const total = projects.length;

  useEffect(() => {
    imgRefs.current = imgRefs.current.slice(0, total);

    if (!total) return undefined;

    const spotlightEl = spotlightRef.current;
    const indexEl = indexRef.current;
    const imagesContainerEl = imagesContainerRef.current;
    const nameWrapEl = nameWrapRef.current;
    const nameEl = nameRef.current;
    const yearEl = yearRef.current;
    const imgEls = imgRefs.current.filter(Boolean);
    if (!spotlightEl || !indexEl || !imagesContainerEl || !nameWrapEl || !nameEl || !yearEl) {
      return undefined;
    }

    // Just digits, no motion -- clear any filter/opacity a previous version
    // of this effect (or a stale hot-reload) may have left on it.
    gsap.set(indexEl, { filter: "none", opacity: 1 });

    const imagesHeight = imagesContainerEl.offsetHeight;
    const moveDistanceImages = window.innerHeight - imagesHeight;
    const activationThreshold = window.innerHeight / 2;

    // The reference's pin length (5x viewport height) was tuned for its
    // fixed set of 10 projects -- scale it so the scroll-per-project pace
    // stays the same whatever TNF's actual project count is.
    const pinLength = window.innerHeight * total * 0.5;

    let lastIndex = -1;

    // How far into its own share of the scroll (0..1) the current project
    // is entitled a fraction of the segment -- past that, it stays fully
    // sharp for the rest of the dwell.
    const BLUR_RAMP = 0.3;
    const MAX_BLUR_PX = 10;
    // Images are stacked with an 0.5rem (gap-2) gap between them.
    const IMG_GAP_PX = 8;
    const MAX_IMG_BLUR_PX = 8;

    const trigger = ScrollTrigger.create({
      trigger: spotlightEl,
      start: "top top",
      end: `+=${pinLength}`,
      pin: true,
      pinSpacing: true,
      scrub: 1,
      onUpdate: (self) => {
        const progress = self.progress;
        const currentIndex = Math.min(Math.floor(progress * total) + 1, total);

        if (currentIndex !== lastIndex) {
          lastIndex = currentIndex;
          const proj = projects[currentIndex - 1];
          indexEl.textContent = `${String(currentIndex).padStart(2, "0")}/${String(
            total
          ).padStart(2, "0")}`;
          nameEl.textContent = proj.title;
          nameEl.href = `/${proj.slug}`;
          yearEl.textContent = proj.year ?? "";
        }

        // Local progress within the current project's own segment -- 0 the
        // moment it becomes current, 1 by the time its segment ends. Tied
        // straight to scroll position every frame (not a fixed-duration
        // tween), so the name sharpens up continuously as you scroll
        // further into a project instead of snapping in on a timer. The
        // counter is left alone -- just its digits changing, no blur.
        const segment = 1 / total;
        const segmentStart = (currentIndex - 1) * segment;
        const localProgress = Math.max(0, Math.min(1, (progress - segmentStart) / segment));
        const ramp = Math.min(localProgress / BLUR_RAMP, 1);
        const blurPx = (1 - ramp) * MAX_BLUR_PX;
        const opacity = 0.4 + 0.6 * ramp;

        gsap.set(nameWrapEl, { filter: `blur(${blurPx}px)`, opacity });

        gsap.set(imagesContainerEl, { y: progress * moveDistanceImages });

        // Distance from the centered/focused slot, in "how many images
        // away" -- 0 at dead center (sharp, full opacity), ramping up to
        // full blur by the time it's about one image-height further off,
        // so the previous/next preview blurs in and out continuously as
        // it approaches or leaves the middle, instead of a hard toggle.
        imgEls.forEach((img) => {
          const r = img.getBoundingClientRect();
          const imgCenter = (r.top + r.bottom) / 2;
          const falloff = r.height + IMG_GAP_PX;
          const t = Math.min(Math.abs(imgCenter - activationThreshold) / falloff, 1);
          gsap.set(img, {
            filter: `blur(${t * MAX_IMG_BLUR_PX}px)`,
            opacity: 1 - t * 0.5,
          });
        });
      },
    });

    ScrollTrigger.refresh();

    return () => trigger.kill();
  }, [total, projects]);

  return (
    <>
      <SiteHeader theme="light" />

      <section className="h-[100svh] flex items-center justify-center text-center px-8 bg-white text-black">
        <p className="text-2xl font-medium">A collection of selected works</p>
      </section>

      {total > 0 ? (
        <section
          ref={spotlightRef}
          className="relative h-[100svh] overflow-hidden p-8 bg-white text-black"
        >
          <h1
            ref={indexRef}
            className="absolute left-8 top-1/2 -translate-y-1/2 uppercase font-medium leading-none text-[clamp(1.25rem,2.5vw,2.5rem)]"
          >
            {`01/${String(total).padStart(2, "0")}`}
          </h1>

          <div
            ref={imagesContainerRef}
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[35%] max-[1000px]:w-[calc(100%-4rem)] py-[50svh] flex flex-col gap-2 max-[1000px]:gap-[25svh] -z-10 will-change-transform"
          >
            {projects.map((proj, i) => (
              <div
                key={proj.slug}
                ref={(el) => (imgRefs.current[i] = el)}
                className="w-full aspect-video opacity-50 overflow-hidden bg-black/5"
              >
                {proj.previewUrl ? (
                  proj.previewType === "video" ? (
                    <video
                      ref={markMuted}
                      src={proj.previewUrl}
                      muted
                      loop
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proj.previewUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )
                ) : null}
              </div>
            ))}
          </div>

          <div
            ref={nameWrapRef}
            className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col items-end"
          >
            <a
              ref={nameRef}
              href={`/${projects[0].slug}`}
              className="text-2xl font-medium leading-[1.25] text-black"
            >
              {projects[0].title}
            </a>
            <span ref={yearRef} className="text-sm text-black/50">
              {projects[0].year ?? ""}
            </span>
          </div>
        </section>
      ) : (
        <section className="h-[100svh] flex items-center justify-center text-center px-8 bg-white text-black/50">
          <p className="text-2xl font-medium">Nothing published yet.</p>
        </section>
      )}

      <section className="h-[100svh] flex items-center justify-center text-center px-8 bg-white text-black">
        <p className="text-2xl font-medium">Scroll complete</p>
      </section>
    </>
  );
}
