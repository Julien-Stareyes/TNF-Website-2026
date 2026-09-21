"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTabStates } from "@/lib/tab-states";
import SiteMenu from "@/components/SiteMenu";

// "HH:mm" in a given IANA zone, right now.
function timeInZone(now, timeZone) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

// The footer/menu clock line, shared by SiteHeader's own bottom bar and
// SiteMenu's overlay (passed down as a prop) so both ever show the exact
// same text instead of drifting apart.
function footerClockLabel(now) {
  return `Paris — ${timeInZone(now, "Europe/Paris")} & New York — ${timeInZone(now, "America/New_York")}`;
}
const FOOTER_CLOCK_PLACEHOLDER = "Paris — --:-- & New York — --:--";

// Persistent chrome shared by the landing/list view and every project detail:
//   - script wordmark top-left (placeholder — swap for real brand asset)
//   - `MENU` toggle top-right, opening the full-screen SiteMenu overlay
// Fixed to the viewport so it stays visible across scroll. Text now reads
// via `mix-blend-mode: difference` (see `textColor` below) so it inverts
// correctly against whatever's behind it instead of a per-page `theme`
// guess -- `theme` is kept as a prop for compatibility with existing
// callers but no longer changes anything.

const SiteHeader = ({ active, theme = "dark", shiftDown = false }) => {
  // The logo lives in the header, not inside SiteMenu's overlay, but the
  // overlay (z-100) sits *under* the header (z-110) so the "Menu" toggle
  // stays clickable to close it -- which means once the menu opens, the
  // logo is now painted over a white full-screen background instead of
  // whatever cover the page had. Track the menu's open state here so the
  // logo can switch to black too instead of staying whatever the page's
  // `theme` says (often white-on-white against the open menu).
  const [menuOpen, setMenuOpen] = useState(false);
  // Portal both the header and the bottom bar onto <body> -- same reason
  // SiteMenu portals its overlay: on some pages (Image, Index) this
  // component is a descendant of a container whose CSS (a transform,
  // filter, perspective, or similar used for that page's own effects)
  // makes IT the containing block for `position: fixed` instead of the
  // viewport. `top-0` still lands near the visual top by coincidence, but
  // `bottom-0` then resolves against that ancestor's own (often much
  // taller, scrollable) box, landing off-screen -- which is why the
  // bottom bar could go missing on those pages while the top header still
  // looked fine. Rendering both from <body> sidesteps the question
  // entirely instead of chasing which ancestor is responsible.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Paris + New York clock for the persistent bottom bar (and, via prop,
  // SiteMenu's own matching row) -- null until mount so the server-
  // rendered markup never disagrees with the client's first paint (the
  // time is inherently client-only). Refreshed every 30s; the label only
  // shows minutes, so anything tighter is wasted work.
  const [clock, setClock] = useState(null);
  useEffect(() => {
    const tick = () => setClock(footerClockLabel(new Date()));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);
  // Menu open: forced plain black, no blend -- the overlay content sits
  // under `perspective`/`translateZ` (SiteMenu's reveal), and a
  // GPU-composited ancestor like that can make `mix-blend-mode` fail to
  // blend against what's visually underneath, which is exactly what broke
  // the "Menu" toggle earlier. Menu closed: true difference-blend so the
  // wordmark reads correctly over whatever the page behind it is showing
  // (video, image, or plain background) instead of a fixed light/dark
  // guess via `theme`.
  const textColor = menuOpen
    ? "text-black"
    : "text-white [mix-blend-mode:difference]";
  const pathname = usePathname();
  const tabStates = useTabStates();
  // On a project detail (any non-root, non-`/image` slug path) the Image
  // link carries the current slug as `?from=<slug>` so the list view can
  // land the carousel back on that project instead of resetting to the
  // first one.
  // Only real project detail routes count — the other top-level pages
  // share the same one-segment shape but aren't projects.
  const NON_PROJECT_PATHS = ["/", "/image", "/immersive", "/archive", "/info"];
  const currentSlug =
    pathname && !NON_PROJECT_PATHS.includes(pathname) && !pathname.startsWith("/admin")
      ? pathname.slice(1)
      : null;
  // Image is the homepage now (moved from a separate showreel landing
  // page) -- "/image" still exists as a redirect for old links, but new
  // navigation always targets "/" directly.
  const imageHref = currentSlug ? `/?from=${currentSlug}` : "/";
  // Marks the item the SiteMenu should show as active on its own list
  // page — project detail routes leave nothing marked even though they
  // belong to a section. "/" counts as Image, same as "/image" itself.
  const resolvedActive =
    active !== undefined
      ? active
      : pathname === "/" || pathname === "/image"
      ? "Image"
      : pathname === "/immersive"
      ? "Immersive"
      : pathname === "/archive"
      ? "Index"
      : pathname === "/info"
      ? "Info"
      : null;
  const chrome = (
    <>
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-[110] flex items-start justify-between px-5 pt-5 md:px-[2.4vw] md:pt-[2.4vh] transition-colors duration-300 ${textColor}`}
      // z-[110]: above the SiteMenu overlay (z-100, portalled onto <body>)
      // so the "Menu" toggle stays visible/clickable to close it once open
      // -- otherwise the overlay covers it and there's no way to dismiss.
      // Its own view-transition group (see globals.css) so the page
      // transition in template.jsx never cross-fades or displaces the
      // header -- it stays put while the page behind it animates.
      // `data-cursor-ignore`: the Image page's cursor-following label
      // (CursorLabel in ScrollScramble.jsx) checks for this to snap off
      // instantly instead of fading out over the menu.
      style={{ viewTransitionName: "navbar" }}
      data-cursor-ignore
    >
      {/* Same size/weight/font as the "Menu" toggle (SiteMenu.jsx), per
          request -- no longer the brand file's larger bold spec. The mark
          contracts to TNF on a phone, where the full name would crowd
          the nav. */}
      <Link
        href="/"
        className="pointer-events-auto font-mono font-light uppercase leading-none text-[11px] md:text-[15px]"
        aria-label="The New Face — home"
      >
        <span className="md:hidden">TNF</span>
        <span className="hidden md:inline">THE NEW FACE</span>
      </Link>

      <SiteMenu
        resolvedActive={resolvedActive}
        tabStates={tabStates}
        imageHref={imageHref}
        onOpenChange={setMenuOpen}
        clockLabel={clock}
      />
    </header>

    {/* Persistent bottom bar -- "Creative Studio" / Paris+NY clock, on
        every page (SiteHeader is the shared chrome). Hidden while the menu
        is open: SiteMenu's own overlay already carries its own bottom row
        with the exact same two labels (passed down as `clockLabel` so they
        can never drift apart), and stacking both at the same position
        would overlap. `shiftDown` (set by a project page while its info
        panel is open) nudges it further down, in sync with that panel's
        own media-area shift -- and back on close, via the same slow
        transition. */}
    {!menuOpen && (
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-[110] flex items-end justify-between px-5 pb-5 md:px-[2.4vw] md:pb-[2.4vh] font-mono uppercase text-[11px] md:text-[13px] leading-none ${textColor} ${
          shiftDown ? "translate-y-[22vh] md:translate-y-[26vh]" : "translate-y-0"
        }`}
        style={{
          // Tailwind v4's `translate-*` utilities animate the CSS `translate`
          // property, not `transform` -- listing `transform` here (as a
          // holdover from v3) meant this bar jumped instantly instead of
          // sliding, which read as an abrupt fade/disappear next to the
          // media area's smooth descent.
          transitionProperty: "color, translate",
          transitionDuration: "300ms, 900ms",
          transitionTimingFunction: "ease, ease-in-out",
        }}
        data-cursor-ignore
      >
        <p>Creative Studio</p>
        <p>{clock ?? FOOTER_CLOCK_PLACEHOLDER}</p>
      </div>
    )}
    </>
  );

  return mounted ? createPortal(chrome, document.body) : null;
};

export default SiteHeader;
