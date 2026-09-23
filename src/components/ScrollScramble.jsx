"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { PROJECTS as STATIC_PROJECTS } from "@/data/projects";
import ProjectMedia, { formatAspectClass } from "@/components/ProjectMedia";
import SiteHeader from "@/components/SiteHeader";

// How near the pointer has to come to the index before the titles appear.
const LIST_NEAR_PX = 260;
const mod = (x, m) => ((x % m) + m) % m;

// Parallax depth on the cover art -- the image drifts against its own
// section's scroll position (how far its top edge is from the top of
// the viewport, as a fraction of viewport height), so it reads as
// sitting behind glass rather than pasted flat to the screen. Written
// straight onto the DOM on scroll, not through React state, so it
// costs nothing extra per frame across every section.
const PARALLAX_FACTOR = 14; // vh of drift per 1.0 of scroll fraction
const PARALLAX_SCALE = 1.2; // zoom margin that absorbs the drift

// ---------------------------------------------------------------------------
// Project index, pinned to the right edge. At rest it's just a column of
// dots; moving the pointer reveals the titles beside them. Clicking a row
// opens that project.
// ---------------------------------------------------------------------------
// Row pitch -- widened so the dots read as a spaced-out list rather than
// a dense strip.
const ROW_PX = 44;

// Total rows visible in the window at once. Skewed slightly toward what's
// coming up (2 above the active row, 3 below) rather than split evenly,
// since an even count has no true centre row to land it on.
const DOT_COUNT = 6;
const ABOVE = 2;
const BELOW = DOT_COUNT - 1 - ABOVE;

// `theme` is unused now that the labels and dots use a difference blend
// instead of a light/dark swap, but the prop is left in place since every
// caller still passes it.
const ProjectList = ({ centerFloat, projects, awake, onPick }) => {
  const N = projects.length;
  const intCentre = Math.round(centerFloat);
  // One extra row past whichever side runs longer, so a row fades in from
  // off-window instead of popping in already visible.
  const buffer = Math.max(ABOVE, BELOW) + 1;

  const rows = [];
  for (let off = -buffer; off <= buffer; off++) {
    const absPos = intCentre + off;
    rows.push({ absPos, index: mod(absPos, N), project: projects[mod(absPos, N)] });
  }

  // Land the active row ABOVE rows down from the top of the window, then
  // add the fractional part of the centre so the strip glides with the
  // slide animation rather than jumping once it settles.
  const containerHeight = ROW_PX * DOT_COUNT;
  const shift = (buffer - ABOVE + (centerFloat - intCentre)) * ROW_PX;

  return (
    <div
      className="relative overflow-hidden pointer-events-auto"
      style={{ height: containerHeight }}
    >
      <div
        className="flex flex-col items-end"
        style={{ transform: `translateY(${-shift}px)` }}
      >
        {rows.map(({ absPos, index, project }) => {
          const distance = Math.abs(absPos - centerFloat);
          const isActive = distance < 0.5;
          // Titles fade out with distance; the dots stay legible so the
          // column still reads as an index when the names are hidden.
          const fade =
            distance < 0.5 ? 1 : distance < 1.5 ? 0.4 : distance < 3 ? 0.25 : 0.12;
          return (
            <button
              key={absPos}
              type="button"
              onClick={() => onPick?.(index)}
              className="group flex items-center justify-end gap-3 w-full"
              style={{ height: ROW_PX }}
              aria-label={`Open ${project.title}`}
            >
              <span
                className={`font-mono text-[11px] uppercase tracking-[0.04em] whitespace-nowrap text-white ${
                  isActive ? "font-bold" : "font-light"
                } group-hover:opacity-100`}
                style={{
                  // Difference blend against whatever's underneath means
                  // it reads on any cover, light or dark, without needing
                  // the `theme` prop at all.
                  mixBlendMode: "difference",
                  opacity: awake ? fade : 0,
                  transform: awake ? "translateX(0)" : "translateX(14px)",
                  transition:
                    "opacity 420ms cubic-bezier(0.22,1,0.36,1), transform 420ms cubic-bezier(0.22,1,0.36,1)",
                  // Rows nearest the open project lead, the rest follow, so
                  // the column unfolds from the middle instead of all
                  // arriving at once.
                  transitionDelay: `${Math.min(distance, 4) * 45}ms`,
                }}
              >
                {project.title}
              </span>
              <span
                className="shrink-0 rounded-full transition-all duration-300 bg-white"
                style={{
                  mixBlendMode: "difference",
                  width: isActive ? 4 : 3,
                  height: isActive ? 4 : 3,
                  opacity: isActive ? 1 : Math.max(0.25, fade),
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Mobile has no dot column — a bar along the bottom names the project and
// gives one obvious way into it.
const MobileBar = ({ title, theme, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className={`md:hidden fixed bottom-0 inset-x-0 z-40 flex items-center justify-between gap-4 px-5 pb-8 pt-4 text-left transition-colors duration-300 ${
      theme === "light" ? "text-black" : "text-white"
    }`}
  >
    {/* Bold here, unlike the index — this is the project's own title. */}
    <span className="font-mono font-bold text-[15px] uppercase tracking-[0.04em] truncate">
      {title}
    </span>
    {/* Straight from the design file. It's drawn as filled shapes, not
        strokes, which is why no stroke weight matched it. */}
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="currentColor"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="M0.556885 16.0395L2.07929 17.5619L17.3033 2.33785L15.7809 0.815453L0.556885 16.0395Z" />
      <path d="M15.2313 0.734306V16.8818H17.3843V0.734306H15.2313Z" />
      <path d="M1.23694 0.734535V2.88754H17.3844V0.734535H1.23694Z" />
    </svg>
  </button>
);

// ---------------------------------------------------------------------------
// Crosshair cursor carrying the current project's name, so the label is
// wherever the eye already is.
// ---------------------------------------------------------------------------
const CursorLabel = ({ label, visible, theme, instant }) => {
  const crossRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    // The crosshair *is* the cursor, so it tracks exactly. The label
    // trails it on an eased follow, which reads as weight rather than a
    // sticker glued to the pointer.
    const target = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };
    let raf = 0;
    let seeded = false;

    // Lower factor, longer tail. At 0.035 the label lags well behind the
    // crosshair across a sweep and drifts in after the pointer stops.
    const FOLLOW = 0.035;

    const tick = () => {
      eased.x += (target.x - eased.x) * FOLLOW;
      eased.y += (target.y - eased.y) * FOLLOW;
      if (labelRef.current)
        labelRef.current.style.transform = `translate3d(${eased.x}px, ${eased.y}px, 0)`;

      const settled =
        Math.abs(target.x - eased.x) < 0.1 && Math.abs(target.y - eased.y) < 0.1;
      raf = settled ? 0 : requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (crossRef.current)
        crossRef.current.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
      // Don't animate in from the origin on the first sighting.
      if (!seeded) {
        seeded = true;
        eased.x = target.x;
        eased.y = target.y;
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const shared =
    "hidden md:block fixed left-0 top-0 z-50 pointer-events-none will-change-transform";
  // The crosshair stays on the ordinary idle fade regardless of what it's
  // over -- only the label snaps off instantly over real chrome, since
  // naming a project you're not actually pointing at is the confusing
  // part, not the cursor mark itself.
  const crossFade = { opacity: visible || instant ? 1 : 0, transition: "opacity 200ms" };
  const labelFade = instant
    ? { opacity: 0, transition: "none" }
    : { opacity: visible ? 1 : 0, transition: "opacity 200ms" };
  // Invert against the slide, the same way the overlay copy does — on a
  // dark project the crosshair goes white and the label flips to a white
  // chip, otherwise neither is legible.
  const onLight = theme === "light";

  return (
    <div aria-hidden="true">
      <div ref={crossRef} className={shared} style={crossFade}>
        {/* Same "+" mark as the site-wide cursor (CustomCursor.jsx) --
            this page used to draw its own thin crosshair (two stroked
            lines) instead, which read as a different cursor here than
            everywhere else. Filled, not stroked, so `fill="currentColor"`
            plus the existing light/dark class below is enough to match
            the slide, no mix-blend-mode needed the way the site-wide one
            uses it against arbitrary page backgrounds. */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 20 20"
          className={`absolute -translate-x-1/2 -translate-y-1/2 transition-colors duration-300 ${
            onLight ? "text-black" : "text-white"
          }`}
        >
          <g clipPath="url(#tnf-image-cursor-clip)">
            <path
              d="M-2.12662 12.1577L7.98163 12.1605L7.98449 22.2688L12.0155 22.2688L12.0184 12.1605L22.1266 12.1577L22.1266 8.12662L12.0184 8.12377L12.0155 -1.98448L7.98448 -1.98448L7.98163 8.12377L-2.12662 8.12662L-2.12662 12.1577Z"
              fill="currentColor"
            />
          </g>
          <defs>
            <clipPath id="tnf-image-cursor-clip">
              <rect width="20" height="20" fill="white" />
            </clipPath>
          </defs>
        </svg>
      </div>

      <div ref={labelRef} className={shared} style={labelFade}>
        <span
          className={`absolute left-2 top-2 font-mono uppercase text-[15px] leading-none px-2 py-1.5 whitespace-nowrap transition-colors duration-300 ${
            onLight ? "bg-black text-white" : "bg-white text-black"
          }`}
        >
          {label}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// A single carousel slide — full-viewport cover. Format-driven treatment:
// 16:9 goes full-bleed *unless* the project has "Full screen" unchecked in
// the admin (`imageFullScreen === false`), in which case it gets the same
// blurred-background + centered-card treatment as the other formats.
// Portrait formats (4:5, and 9:16 on desktop) always get that treatment.
// ---------------------------------------------------------------------------
const Slide = ({ project, isMobile, onClick, isNear }) => {
  const isFullBleed =
    (project.format === "16:9" && project.imageFullScreen !== false) ||
    (project.format === "9:16" && isMobile);

  // A zoomed wrapper around the cover, so the scroll handler can nudge it
  // up/down (see the `parallax` loop in ScrollScramble) without ever
  // exposing an edge. `data-parallax` is how that loop finds it.
  const parallaxWrap = (children) => (
    <div
      data-parallax
      className="absolute inset-0"
      style={{ transform: `scale(${PARALLAX_SCALE})`, willChange: "transform" }}
    >
      {children}
    </div>
  );

  if (isFullBleed) {
    return (
      <div
        onClick={onClick}
        className="w-full h-screen overflow-clip relative cursor-pointer"
      >
        {parallaxWrap(
          <ProjectMedia project={project} isNear={isNear} isMobile={isMobile} />
        )}
      </div>
    );
  }

  const aspectClass = formatAspectClass(project.format);
  // Mobile sizes the card from the width so the aspect ratio always
  // holds; desktop sizes from the height so mixed formats share a row.
  const cardSize =
    project.format === "16:9"
      ? "w-[92vw] md:w-auto md:h-[58vh]"
      : "w-[86vw] md:w-auto md:h-[66vh]";
  const maxWidthClass =
    project.format === "16:9" ? "md:max-w-[75vw]" : "md:max-w-[70vw]";

  // The background is already blurred 48px and scaled up, so a separate,
  // heavily-compressed clip reads identically there while costing far
  // less to decode than a second copy of the sharp source -- two <video>
  // elements playing the exact same file at once otherwise doubles GPU
  // decode load on one slide, which matters most on phones. Falls back
  // to the main cover when no blur variant has been uploaded yet.
  const bgProject = project.videoBlur
    ? { ...project, video: project.videoBlur, videoMobile: project.videoBlur }
    : project;

  return (
    <div className="w-full h-screen overflow-hidden relative flex items-center justify-center">
      <div
        aria-hidden
        className="absolute inset-0 size-full overflow-hidden"
        style={{ filter: "blur(48px)", transform: "scale(1.25)" }}
      >
        {parallaxWrap(
          <ProjectMedia project={bgProject} isNear={isNear} isMobile={isMobile} />
        )}
      </div>
      <div
        onClick={onClick}
        className={`relative z-10 ${cardSize} ${maxWidthClass} ${aspectClass} overflow-hidden shadow-2xl cursor-pointer`}
      >
        <ProjectMedia project={project} isNear={isNear} isMobile={isMobile} />
      </div>
    </div>
  );
};

// Breakpoint-aware mobile flag.
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
};

// ---------------------------------------------------------------------------
// Virtual carousel — DOM contains only prev / current / next slides at any
// time, positioned via translateY. A wheel or key press animates the three
// slides together by one viewport height, then the center advances by one
// and the DOM shifts (no visible jump because the two positions carry the
// same content). Truly infinite loop with no scroll teleport.
// ---------------------------------------------------------------------------
const ScrollScramble = ({ projects: projectsProp }) => {
  // Fall back to the bundled static list only when the server didn't hand
  // us one (dev tinkering, or before the DB migration ran).
  const projects = projectsProp?.length ? projectsProp : STATIC_PROJECTS;
  const N = projects.length;

  const isMobile = useIsMobile();
  const router = useRouter();
  const [liveTheme, setLiveTheme] = useState(null);
  const containerRef = useRef(null);

  // Plain page scroll now, not a carousel: every project is a normal
  // full-viewport section stacked in document flow, and Lenis (mounted
  // once, globally) is what smooths the scrolling — this component only
  // reads where the page is, it doesn't drive it.
  //
  // `progress` is that reading turned into "projects": 0 at the top of
  // the first section, 1 at the top of the second, and so on. The dot
  // column, the cursor label and which cover gets a live <video> all come
  // from this one continuous number.
  const [progress, setProgress] = useState(0);

  // Gates the index column's portal to <body> (see the render below) --
  // false during SSR/first paint so the server-rendered markup never
  // disagrees with the client's, same guard SiteHeader uses for its own
  // portal.
  const [indexColumnMounted, setIndexColumnMounted] = useState(false);
  useEffect(() => setIndexColumnMounted(true), []);

  const sectionsRef = useRef([]);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const vh = window.innerHeight || 1;
      const top = el.getBoundingClientRect().top; // negative once scrolled into
      setProgress(Math.max(0, Math.min(N - 1, -top / vh)));

      // Each section drifts its own cover by a fraction of how far its own
      // top edge has travelled from the top of the viewport -- 0 while
      // it's exactly filling the screen, drifting further the closer it
      // is to entering or leaving.
      for (const section of sectionsRef.current) {
        if (!section) continue;
        const frac = section.getBoundingClientRect().top / vh;
        const clamped = Math.max(-1, Math.min(1, frac));
        const layer = section.querySelector("[data-parallax]");
        if (layer)
          layer.style.transform = `scale(${PARALLAX_SCALE}) translateY(${-clamped * PARALLAX_FACTOR}vh)`;
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [N]);

  const active = Math.max(0, Math.min(N - 1, Math.round(progress)));
  const activeProject = projects[active];

  // If the user arrived via the Image nav link from a project detail
  // (`?from=<slug>`), jump to that project's section on mount so they
  // land where they left off rather than at the top.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const from = new URLSearchParams(window.location.search).get("from");
    if (!from) return;
    const i = projects.findIndex((p) => p.slug === from);
    if (i > 0) {
      const el = containerRef.current;
      const top = (el?.offsetTop ?? 0) + i * window.innerHeight;
      window.scrollTo({ top });
    }
    // Clean the query param out of the URL so a subsequent refresh doesn't
    // keep re-jumping.
    const url = new URL(window.location.href);
    url.searchParams.delete("from");
    window.history.replaceState(null, "", url.toString());
  }, [projects]);

  // A reading belongs to the project it was taken from. Carrying it into
  // the next one meant stepping from a bright project onto a dark one kept
  // the bright project's black text until the new cover had loaded enough
  // to sample — which on a slow cover is black text on a black screen for
  // as long as it takes.
  useEffect(() => {
    setLiveTheme(null);
  }, [active]);

  // Live theme detector: sample whichever video sits at the middle of the
  // viewport and pick a text color that reads on top of it.
  useEffect(() => {
    if (isMobile) return;
    const canvas = document.createElement("canvas");
    canvas.width = 32; canvas.height = 18;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const sample = () => {
      const centerY = window.innerHeight / 2;
      const videos = document.querySelectorAll("section video");
      let activeVideo = null;
      for (const v of videos) {
        const r = v.getBoundingClientRect();
        if (r.top <= centerY && r.bottom >= centerY) { activeVideo = v; break; }
      }
      if (!activeVideo || activeVideo.readyState < 2) return;
      try {
        ctx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let sum = 0;
        const pixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }
        setLiveTheme(sum / pixels >= 128 ? "light" : "dark");
      } catch { /* not ready */ }
    };
    const id = setInterval(sample, 250);
    return () => clearInterval(id);
  }, [isMobile]);

  const theme = liveTheme ?? activeProject.theme ?? "dark";

  // The crosshair and its label show while the pointer is in play and fade
  // out once it has been still for a moment.
  const [awake, setAwake] = useState(false);
  // True while the pointer is over real site chrome (the nav) rather than
  // the gallery itself -- see `data-cursor-ignore` on SiteHeader.
  const [overChrome, setOverChrome] = useState(false);
  // The index keeps to its dots until the pointer comes near it; the
  // titles are for whoever is reaching for them, not for everyone.
  const [listNear, setListNear] = useState(false);
  const listRef = useRef(null);
  // Which section the pointer is over. On a normal scroll this is almost
  // always the active one, except right as two sections cross.
  const [hoverIndex, setHoverIndex] = useState(0);
  const pointerYRef = useRef(null);

  // The pointer's own position in document space says which section it's
  // over, independent of whatever `active` currently reads.
  const indexUnderPointer = useCallback(() => {
    const y = pointerYRef.current;
    const el = containerRef.current;
    if (y == null || !el) return active;
    const vh = window.innerHeight || 1;
    const docY = window.scrollY + y - el.offsetTop;
    return Math.max(0, Math.min(N - 1, Math.floor(docY / vh)));
  }, [active, N]);

  useEffect(() => {
    if (isMobile) return;
    let timer;
    const wake = () => {
      setAwake(true);
      clearTimeout(timer);
      timer = setTimeout(() => setAwake(false), 1800);
    };

    const onMove = (e) => {
      wake();

      pointerYRef.current = e.clientY;
      setHoverIndex(indexUnderPointer());
      // Real site chrome (the nav) sits on top of the gallery -- the
      // cursor label should snap off the moment it's underneath instead
      // of riding along over real UI.
      setOverChrome(Boolean(e.target?.closest?.("[data-cursor-ignore]")));

      const box = listRef.current?.getBoundingClientRect();
      if (!box) return;
      const dx = Math.max(box.left - e.clientX, 0, e.clientX - box.right);
      const dy = Math.max(box.top - e.clientY, 0, e.clientY - box.bottom);
      setListNear(Math.hypot(dx, dy) < LIST_NEAR_PX);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("scroll", wake, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", wake);
      clearTimeout(timer);
    };
  }, [isMobile]);

  // The pointer can sit still while the page scrolls under it, so the
  // section beneath it changes with no pointer event to announce it.
  useEffect(() => {
    if (isMobile) return;
    setHoverIndex(indexUnderPointer());
  }, [progress, isMobile, indexUnderPointer]);

  const hovered = projects[hoverIndex] ?? activeProject;
  const hoveredIsActive = hoverIndex === active;

  // Warm the next and previous covers so a step plays from cache rather
  // than from nothing. This is the browser's own prefetch: it costs no
  // video element, and it runs at a priority that yields to anything the
  // page actually needs.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    setWarm(false);
    const t = setTimeout(() => setWarm(true), 1200);
    return () => clearTimeout(t);
  }, [active]);

  // Not on a phone: two covers coming down in the background is bandwidth
  // and decode the device would rather spend on the one on screen.
  const neighbourCovers = warm && !isMobile
    ? [active - 1, active + 1]
        .filter((i) => i >= 0 && i < N)
        .map((i) => projects[i])
        .map((p) => (isMobile ? p?.videoMobile || p?.video : p?.video))
        .filter(Boolean)
    : [];

  const goToProject = (project) => router.push(`/${project.slug}`);

  // Picking a row from the index scrolls to it. Lenis owns real scrolling
  // site-wide (see components/SmoothScroll/Lenis.jsx, which exposes the
  // instance on `window.__lenis` for exactly this) so the jump is eased
  // the same as everything else; a plain scroll is the fallback before it
  // has mounted.
  const scrollToIndex = (i) => {
    const el = containerRef.current;
    const top = (el?.offsetTop ?? 0) + i * window.innerHeight;
    if (window.__lenis) window.__lenis.scrollTo(top, { duration: 1.2 });
    else window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <div ref={containerRef} className="relative w-full cursor-crosshair-scope">
      <SiteHeader theme={theme} />

      {/* Both of these are desktop chrome. */}
      {!isMobile && (
        <>
      <CursorLabel
        label={hovered.brand || hovered.title}
        visible={!isMobile && awake && !overChrome}
        // No fade when it's the menu that pushed it off -- only the
        // ordinary idle-out gets the 200ms transition.
        instant={overChrome}
        // Reads against whatever is under it, which right at a section
        // crossing is not necessarily the project the rest of the page is
        // styled on.
        theme={hoveredIsActive ? theme : hovered.theme ?? "dark"}
      />

      {/* Index down the right edge. Column is centred on the viewport so
          the active row sits level with the middle of the section.
          Portalled onto <body>, same reason and same fix as SiteHeader:
          rendered in place, this column sat under the covers' own
          transformed/GPU-composited layers, which is what silently drops
          the titles' and dots' `mix-blend-mode: difference` (confirmed
          live -- a plain blended test element at this exact spot failed
          to blend too, and only started working again once it was
          appended straight to <body>). Portalling escapes that layer
          instead of fighting it with more CSS. */}
      {indexColumnMounted &&
        createPortal(
          <div className="hidden md:flex fixed inset-y-0 right-[2.4vw] z-40 items-center justify-end pointer-events-none">
            <div ref={listRef}>
              <ProjectList
                centerFloat={progress}
                theme={theme}
                projects={projects}
                awake={listNear}
                onPick={(i, opts) => {
                  const idx = mod(i, N);
                  const p = projects[idx];
                  // Clicking the row you're already on opens it; clicking
                  // another scrolls the page to it first.
                  if (opts?.open || idx === active) goToProject(p);
                  else scrollToIndex(idx);
                }}
              />
            </div>
          </div>,
          document.body
        )}
        </>
      )}

      <MobileBar
        title={activeProject.title}
        theme={theme}
        onOpen={() => goToProject(activeProject)}
      />

      {projects.map((project, i) => (
        <section
          key={project.slug}
          ref={(el) => { sectionsRef.current[i] = el; }}
          className="relative w-full h-screen"
        >
          <Slide
            project={project}
            isMobile={isMobile}
            // Only the section on screen gets a <video> at all -- see
            // ProjectMedia's own comment on why the neighbours stay
            // paused/poster-only.
            isNear={i === active}
            onClick={() => goToProject(project)}
          />
        </section>
      ))}

      {neighbourCovers.map((href) => (
        <link key={href} rel="prefetch" as="video" href={href} />
      ))}
    </div>
  );
};

export default ScrollScramble;
