"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { CustomEase } from "gsap/dist/CustomEase";
import SiteHeader from "@/components/SiteHeader";
import { markMuted } from "@/lib/muted-video";

// "Option 2" for the Index page -- a second, hover-driven take, ported from
// a different reference demo than the pinned-scroll "spotlight" version
// (IndexSpotlight.jsx). Titles wrap as a plain list; hovering one grows a
// centered preview open from a point (clip-path) while its image/video
// zooms in from a slight overscale and fades up, and the previous preview
// fades out the same way it came in. Same data (listForTab("index")) and
// the same SiteHeader chrome as the rest of the app -- only the
// interaction and layout are new, so the two can sit side by side and get
// compared before picking one.
gsap.registerPlugin(CustomEase);
if (!CustomEase.get("hop")) {
  CustomEase.create("hop", "M0,0 C0.071,0.505 0.192,0.726 0.318,0.852 0.45,0.984 0.504,1 1,1");
}

export default function IndexHoverPreview({ projects }) {
  const previewRef = useRef(null);
  const nameRefs = useRef([]);
  const total = projects.length;

  useEffect(() => {
    nameRefs.current = nameRefs.current.slice(0, total);
    const previewEl = previewRef.current;
    const nameEls = nameRefs.current.filter(Boolean);
    if (!previewEl || !nameEls.length) return undefined;

    let activeIndex = -1;
    // Per-name active wrapper/media, keyed by index -- mirrors the
    // reference's closures, just addressed by index instead of one set of
    // closure variables per listener (React re-runs this effect on data
    // change, so state lives here rather than on the DOM node).
    const active = new Map();

    const showPreview = (index) => {
      const proj = projects[index];
      if (!proj?.previewUrl) return;

      const wrapper = document.createElement("div");
      wrapper.className = "absolute inset-0 overflow-hidden";
      wrapper.style.clipPath = "polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)";

      let media;
      if (proj.previewType === "video") {
        media = document.createElement("video");
        media.src = proj.previewUrl;
        media.muted = true;
        media.loop = true;
        media.playsInline = true;
        media.autoplay = true;
        markMuted(media);
      } else {
        media = document.createElement("img");
        media.src = proj.previewUrl;
        media.alt = "";
      }
      media.className = "absolute inset-0 w-full h-full object-cover";
      gsap.set(media, { scale: 1.25, opacity: 0 });

      wrapper.appendChild(media);
      previewEl.appendChild(wrapper);
      active.set(index, { wrapper, media });

      gsap.to(wrapper, {
        clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
        duration: 0.5,
        ease: "hop",
      });
      gsap.to(media, { opacity: 1, duration: 0.25, ease: "power2.out" });
      gsap.to(media, { scale: 1, duration: 1.25, ease: "hop" });
    };

    const hidePreview = (index) => {
      const entry = active.get(index);
      if (!entry) return;
      active.delete(index);
      gsap.to(entry.media, {
        opacity: 0,
        duration: 0.5,
        ease: "power1.out",
        onComplete: () => entry.wrapper.remove(),
      });
    };

    const cleanups = nameEls.map((el, index) => {
      const onEnter = () => {
        if (activeIndex === index) return;
        if (activeIndex !== -1) hidePreview(activeIndex);
        activeIndex = index;
        showPreview(index);
      };
      const onLeave = (event) => {
        if (event.relatedTarget && el.contains(event.relatedTarget)) return;
        if (activeIndex === index) activeIndex = -1;
        hidePreview(index);
      };
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
      return () => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
      };
    });

    return () => {
      cleanups.forEach((fn) => fn());
      active.forEach(({ wrapper }) => wrapper.remove());
    };
  }, [projects, total]);

  return (
    <>
      <SiteHeader theme="light" />

      <section className="relative w-full min-h-[100svh] p-8 flex flex-col justify-end gap-8 overflow-hidden bg-white text-black">
        <div
          ref={previewRef}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[50%] max-[1000px]:w-full max-[1000px]:h-full pointer-events-none"
        />

        <div className="relative z-[1]">
          <p className="font-mono text-[11px] uppercase text-black/40">Selected works</p>
        </div>

        {total > 0 ? (
          <div
            className="relative z-[2] w-[80%] max-[1000px]:w-full mb-4 flex flex-wrap gap-3"
            style={{ mixBlendMode: "difference" }}
          >
            {projects.map((proj, i) => (
              <Link
                key={proj.slug}
                href={`/${proj.slug}`}
                ref={(el) => (nameRefs.current[i] = el)}
                className="tnf-index2-name relative inline-block font-mono text-lg md:text-2xl text-white"
              >
                {proj.title}
                {i < total - 1 ? "," : "."}
              </Link>
            ))}
          </div>
        ) : (
          <p className="relative z-[2] font-mono text-sm text-black/40">
            Nothing published yet.
          </p>
        )}
      </section>
    </>
  );
}
