"use client";
import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import SiteHeader from "@/components/SiteHeader";
import { markMuted } from "@/lib/muted-video";

// "Option 2" for the Index page, take 2 -- ported from a different
// reference (a three-column project row: year / title / category) than
// the other two Index experiments already in this codebase
// (IndexSpotlight.jsx = the pinned scroll version, IndexHoverPreview.jsx =
// the earlier hover-preview take, now shelved). Two things carry over from
// the reference almost verbatim:
//   - each column holds its text twice, stacked (a plain CSS/GSAP swap: the
//     original slides up out of view on hover while its black duplicate
//     slides up into place from below -- no motion needed on mouseout
//     beyond reversing it), and hovering the row list at all dims every
//     *other* row's original text to gray, exactly like the reference's
//     plain `.menu:hover` rule;
//   - a small preview box trails the cursor and, per hover, wipes a new
//     image/video frame in from the bottom (clip-path), stacking a short
//     history of the last few frames rather than replacing one image --
//     that stack is what gives the reference its "melting" look. It wipes
//     back out when the pointer leaves the whole list.
// Same project data (still `listForTab("index")`, passed down from
// app/archive-v2/page.js) and the same SiteHeader chrome as every other
// page -- only the row layout and hover interaction are new.
const MAX_TRAIL = 6;

export default function IndexYardHover({ projects }) {
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const previewRef = useRef(null);
  const previewWrapRef = useRef(null);
  const total = projects.length;

  useLayoutEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, total);
    const menuEl = menuRef.current;
    const preview = previewRef.current;
    const previewWrap = previewWrapRef.current;
    const itemEls = itemRefs.current.filter(Boolean);
    if (!menuEl || !preview || !previewWrap || !itemEls.length) {
      return undefined;
    }

    const CLOSED = "polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)";
    const OPEN = "polygon(0% 100%, 100% 100%, 100% 0%, 0% 0%)";
    const RETRACT = "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)";

    // Entrance: each row blur-fades in, staggered with a short delay so the
    // list reads as appearing line by line rather than all at once.
    // fromTo (rather than set + to) forces GSAP to render the hidden state
    // synchronously before the tween starts, avoiding a flash of the fully
    // visible row on first paint; the delay lets the page transition
    // (template.jsx) settle first so the stagger isn't buried under it.
    gsap.fromTo(
      itemEls,
      { opacity: 0, filter: "blur(10px)" },
      {
        opacity: 1,
        filter: "blur(0px)",
        duration: 0.8,
        ease: "power2.out",
        stagger: 0.04,
        delay: 0.3,
      }
    );

    const appendFrame = (proj) => {
      if (!proj?.previewUrl) return;
      let el;
      if (proj.previewType === "video") {
        el = document.createElement("video");
        el.src = proj.previewUrl;
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        el.autoplay = true;
        markMuted(el);
      } else {
        el = document.createElement("img");
        el.src = proj.previewUrl;
        el.alt = "";
      }
      el.className = "absolute inset-0 w-full h-full object-cover";
      el.style.clipPath = CLOSED;
      preview.appendChild(el);

      gsap.to(el, {
        clipPath: OPEN,
        duration: 1,
        ease: "power3.out",
        onComplete: () => {
          while (preview.children.length > MAX_TRAIL) preview.removeChild(preview.firstChild);
        },
      });
    };

    const cleanups = itemEls.map((item, index) => {
      const originals = item.querySelectorAll(".tnf-yard-text-1");
      const duplicates = item.querySelectorAll(".tnf-yard-text-2");

      const onEnter = () => {
        gsap.to(originals, { top: "-100%", duration: 0.3 });
        gsap.to(duplicates, { top: "0%", duration: 0.3 });
        appendFrame(projects[index]);
      };
      const onLeave = () => {
        gsap.to(originals, { top: "0%", duration: 0.3 });
        gsap.to(duplicates, { top: "100%", duration: 0.3 });
      };
      item.addEventListener("mouseenter", onEnter);
      item.addEventListener("mouseleave", onLeave);
      return () => {
        item.removeEventListener("mouseenter", onEnter);
        item.removeEventListener("mouseleave", onLeave);
      };
    });

    const onMenuLeave = () => {
      gsap.to(previewWrap.querySelectorAll("img, video"), {
        clipPath: RETRACT,
        duration: 1,
        ease: "power3.out",
      });
    };
    menuEl.addEventListener("mouseleave", onMenuLeave);

    const onMouseMove = (e) => {
      gsap.to(previewWrap, {
        x: e.clientX + 30,
        y: e.clientY - 90,
        duration: 1,
        ease: "power3.out",
      });
    };
    document.addEventListener("mousemove", onMouseMove);

    return () => {
      cleanups.forEach((fn) => fn());
      menuEl.removeEventListener("mouseleave", onMenuLeave);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [projects, total]);

  return (
    <>
      <SiteHeader theme="light" />

      <div
        ref={previewWrapRef}
        className="hidden md:block fixed top-0 left-0 z-[2] w-[220px] h-[270px] pointer-events-none"
      >
        <div ref={previewRef} className="absolute inset-0 overflow-hidden bg-black/5" />
      </div>

      <section className="relative min-h-[100svh] bg-white text-black pt-[9em] pb-[17.5em] px-8">
        {total > 0 ? (
          <div ref={menuRef} className="tnf-yard-menu w-full">
            {projects.map((proj, i) => (
              <Link
                key={proj.slug}
                href={`/${proj.slug}`}
                ref={(el) => (itemRefs.current[i] = el)}
                className="tnf-yard-item"
              >
                <div className="tnf-yard-col tnf-yard-info">
                  <p className="tnf-yard-text tnf-yard-text-1">{proj.year ?? ""}</p>
                  <p className="tnf-yard-text tnf-yard-text-2">{proj.year ?? ""}</p>
                </div>
                <div className="tnf-yard-col tnf-yard-name">
                  <p className="tnf-yard-text tnf-yard-text-1">{proj.title}</p>
                  <p className="tnf-yard-text tnf-yard-text-2">{proj.title}</p>
                </div>
                <div className="tnf-yard-col tnf-yard-tag">
                  <p className="tnf-yard-text tnf-yard-text-1">{proj.category}</p>
                  <p className="tnf-yard-text tnf-yard-text-2">{proj.category}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="font-mono text-sm text-black/40">Nothing published yet.</p>
        )}
      </section>
    </>
  );
}
