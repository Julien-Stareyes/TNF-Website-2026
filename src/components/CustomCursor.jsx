"use client";
import { useEffect, useRef } from "react";

// Site-wide custom cursor -- a small "+" mark, tracking the pointer 1:1,
// blended against whatever's underneath it via mix-blend-mode: difference
// (see the `.tnf-cursor` rule in globals.css, plus the `cursor: none` that
// hides the native pointer everywhere). Mounted once in layout.js as a
// direct child of <body> so nothing in between introduces its own
// stacking context -- that would stop the blend from reaching the actual
// page content.
//
// Skipped entirely inside the admin's edit-mode preview iframe (ProjectView
// embeds that separately) -- an operator editing text needs the native
// caret and drag cursors, not this mark. Skipped on touch too, since
// there's no pointer to draw it at.
const CustomCursor = () => {
  const ref = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (window.parent !== window) return undefined; // admin preview iframe
    if (window.matchMedia("(hover: none), (pointer: coarse)").matches) {
      return undefined;
    }

    const el = ref.current;
    if (!el) return undefined;

    // Only suppress the native cursor once this mark is actually going to
    // draw one -- the `html.tnf-cursor-active` gate in globals.css means
    // the two guards above (iframe, touch) leave the real pointer alone
    // instead of hiding it with nothing standing in for it.
    document.documentElement.classList.add("tnf-cursor-active");

    let visible = false;
    const show = () => {
      if (!visible) {
        visible = true;
        el.style.opacity = "1";
      }
    };
    const hide = () => {
      if (visible) {
        visible = false;
        el.style.opacity = "0";
      }
    };

    const onMove = (e) => {
      el.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      // The Image carousel (and anything else opting into
      // .cursor-crosshair-scope) already draws its own dedicated cursor --
      // don't stack this mark on top of it there.
      if (e.target instanceof Element && e.target.closest(".cursor-crosshair-scope")) {
        hide();
      } else {
        show();
      }
    };
    const onLeave = () => hide();

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerout", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onLeave);
      document.documentElement.classList.remove("tnf-cursor-active");
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="tnf-cursor fixed left-0 top-0 z-[999] pointer-events-none will-change-transform"
      style={{ opacity: 0 }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute -translate-x-1/2 -translate-y-1/2"
      >
        <g clipPath="url(#tnf-cursor-clip)">
          {/* Filled white, not black -- with mix-blend-mode: difference a
              black mark on white ground blends to white-on-white and
              disappears. White inverts to black on light backgrounds and
              stays white on dark ones, which is the whole point of the
              effect. */}
          <path
            d="M-2.12662 12.1577L7.98163 12.1605L7.98449 22.2688L12.0155 22.2688L12.0184 12.1605L22.1266 12.1577L22.1266 8.12662L12.0184 8.12377L12.0155 -1.98448L7.98448 -1.98448L7.98163 8.12377L-2.12662 8.12662L-2.12662 12.1577Z"
            fill="white"
          />
        </g>
        <defs>
          <clipPath id="tnf-cursor-clip">
            <rect width="20" height="20" fill="white" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
};

export default CustomCursor;
