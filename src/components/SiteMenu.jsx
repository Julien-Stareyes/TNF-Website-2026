"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import gsap from "gsap";

// Replaces the old top-right nav list. Ported from a reference demo's
// full-screen menu reveal: `MENU` toggles an overlay that uncovers from
// the edges of the screen inward while its content comes off a blurred,
// pulled-forward plane into focus (see `menuClipPath` below for how the
// edges-inward direction is reproduced without touching page markup).
// Colour swapped from the reference's dark red to white/black, per the
// brief.
const NAV_ITEMS = [
  // This entry's own href is never actually used -- `items` below always
  // replaces it with SiteHeader's `imageHref` prop (which points at "/",
  // now the homepage, with a `?from=` when leaving a project). Kept here
  // just as the source of the label/key.
  { label: "Image", href: "/", key: "image" },
  { label: "Immersive", href: "/immersive", key: "immersive" },
  { label: "Index", href: "/archive", key: "index" },
  { label: "Info", href: "/info", key: "info" },
];

// The reference clips its PAGE element away (full rect -> a point at
// center), which visually reads as the always-static menu behind it being
// uncovered from the OUTER EDGES INWARD. Since nothing here wraps every
// page's real content in one clippable element (see the file-level note),
// the same edges-inward reveal is produced on the menu overlay itself: its
// clip-path is a single polygon tracing the full viewport, then a "slit"
// into a second rectangle (the shrinking transparent hole) wound in the
// opposite direction, which cancels via the default nonzero fill rule --
// a standard frame-with-a-hole trick that works with plain `polygon()`,
// no evenodd/path() needed. `p` is the hole's size: 1 = hole fills the
// viewport (menu fully invisible, closed), 0 = hole has shrunk to a point
// at center (menu fully covers the screen, open) -- so the black ring
// grows in from the edges as `p` goes from 1 to 0, matching the reference.
const menuClipPath = (p) => {
  const inset = (1 - p) * 50;
  const left = inset;
  const right = 100 - inset;
  const top = inset;
  const bottom = 100 - inset;
  return `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${left}% ${top}%, ${left}% ${bottom}%, ${right}% ${bottom}%, ${right}% ${top}%, ${left}% ${top}%, 0% 0%)`;
};

// Plain static label -- no per-link motion. The group-wide blur (siblings
// dim while the hovered link stays sharp) is driven from real mouseenter/
// mouseleave on THIS element rather than a CSS `:hover`/`:has()` combo: the
// content plane sits under `perspective` + `translateZ` (for the reveal's
// depth-blur), and 3D-transformed ancestors can make a browser's hover
// hit-testing disagree with what's visually under the pointer, which was
// making the whole nav read as "hovered" from a cursor position nowhere
// near a link. Explicit JS state sidesteps that entirely.
const MenuLink = ({ label, href, isActive, dimmed, onNavigate, onHoverChange }) => (
  <Link
    href={href}
    onClick={onNavigate}
    onMouseEnter={() => onHoverChange(true)}
    onMouseLeave={() => onHoverChange(false)}
    className={`tnf-menu-link block font-mono uppercase leading-none text-black ${
      isActive ? "opacity-100" : "opacity-80 hover:opacity-100"
    }`}
    style={dimmed ? { filter: "blur(3px)", opacity: 0.35 } : { filter: "blur(0px)" }}
  >
    {label}
  </Link>
);

const FOOTER_CLOCK_PLACEHOLDER = "Paris — --:-- & New York — --:--";

const SiteMenu = ({ resolvedActive, tabStates, imageHref, onOpenChange, clockLabel }) => {
  const [open, setOpen] = useState(false);
  const [hoveredKey, setHoveredKey] = useState(null);
  const overlayRef = useRef(null);
  const contentRef = useRef(null);
  const tlRef = useRef(null);
  // The header (this component's parent) is a `position: fixed` element
  // with its own z-index, which makes it a stacking context -- any
  // z-index set on a descendant only competes *inside* that context, not
  // against the rest of the page (a z-50 cursor label rendered outside
  // the header would still sit above a z-60 child of it). Portalling the
  // overlay onto <body> escapes that ceiling entirely.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const items = [
    { label: "Image", href: imageHref, key: "image" },
    ...NAV_ITEMS.slice(1),
  ].filter(({ key }) => tabStates?.[key] !== "hidden");

  const ensureTimeline = () => {
    if (tlRef.current) return tlRef.current;
    const clipState = { p: 1 };
    const tl = gsap.timeline({ paused: true });
    tl.to(clipState, {
      p: 0,
      duration: 1,
      ease: "power3.inOut",
      onUpdate: () => {
        if (overlayRef.current) {
          overlayRef.current.style.clipPath = menuClipPath(clipState.p);
        }
      },
    });
    tl.to(
      contentRef.current,
      { z: 0, filter: "blur(0px)", opacity: 1, duration: 1, ease: "power3.inOut" },
      "-=0.8"
    );
    tlRef.current = tl;
    return tl;
  };

  const toggle = () => {
    const tl = ensureTimeline();
    setOpen((v) => {
      const next = !v;
      next ? tl.play() : tl.reverse();
      onOpenChange?.(next);
      return next;
    });
  };

  const close = () => {
    if (!open) return;
    tlRef.current?.reverse();
    setOpen(false);
    onOpenChange?.(false);
  };

  const overlay = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] bg-white"
      style={{
        clipPath: menuClipPath(1),
        perspective: "1000px",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      <div
        ref={contentRef}
        className="absolute inset-0 flex flex-col justify-end"
        style={{
          transform: "translateZ(350px)",
          filter: "blur(10px)",
          opacity: 0,
          willChange: "transform, filter, opacity",
        }}
      >
        <nav className="tnf-menu-nav flex-1 flex flex-row flex-wrap items-center justify-center gap-4 md:gap-8 px-6">
          {items.flatMap(({ label, href, key }, i) => {
            const link = (
              <MenuLink
                key={key}
                label={label}
                href={href}
                isActive={resolvedActive === label}
                dimmed={hoveredKey !== null && hoveredKey !== key}
                onNavigate={close}
                onHoverChange={(isHovering) => setHoveredKey(isHovering ? key : null)}
              />
            );
            if (i === items.length - 1) return [link];
            return [
              link,
              <span key={`${key}-plus`} aria-hidden="true" className="tnf-menu-plus">
                +
              </span>,
            ];
          })}
        </nav>

        {/* Same two labels as SiteHeader's own bottom bar -- "Creative
            Studio" on the left, the Paris/New York clock on the right --
            passed down as `clockLabel` so the two never drift apart. This
            used to read "Copyright 2026 The New Face" / "Creative Studio",
            the wrong way round from the rest of the site. */}
        <div className="flex items-end justify-between px-5 pb-5 md:px-[2.4vw] md:pb-[2.4vh] font-mono uppercase text-black text-[11px] md:text-[13px]">
          <p>Creative Studio</p>
          <p>{clockLabel ?? FOOTER_CLOCK_PLACEHOLDER}</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        // Closed: difference-blend, same reasoning as SiteHeader's wordmark
        // -- reads correctly over any page background. Open: forced plain
        // black, no blend -- the overlay content sits under `perspective`/
        // `translateZ` for its reveal, and blending across that kind of
        // GPU-composited layer is what made this button stay invisible
        // over the (also white) overlay background before.
        className={`pointer-events-auto font-mono font-light uppercase leading-none text-[11px] md:text-[15px] ${
          open ? "text-black" : "text-white [mix-blend-mode:difference]"
        }`}
      >
        Menu
      </button>

      {mounted ? createPortal(overlay, document.body) : null}
    </>
  );
};

export default SiteMenu;
