"use client";
import { useEffect, useState } from "react";

// First-load-only intro: a plain white screen with a single 0->100%
// counter dead center. Nothing else -- no wordmark, no discipline words.
// Once it hits 100%, it holds briefly then the whole overlay fades away
// to reveal the page underneath. Shown once per browser session
// (sessionStorage), not on every internal navigation -- template.jsx's
// page transition still handles that separately.
const COUNT_MS = 2200; // 0 -> 100%
const HOLD_MS = 250; // brief pause at 100% before the overlay starts fading
const OVERLAY_FADE_MS = 700;

const SiteLoader = () => {
  // null: still deciding (sessionStorage read is client-only); false: skip
  // entirely (already shown this session, or SSR pass); true: play it.
  const [show, setShow] = useState(null);
  const [overlayPhase, setOverlayPhase] = useState("playing"); // "playing" | "fading"
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem("tnf-loader-shown") === "1";
    } catch {
      // Storage can throw (private mode, blocked) -- treat as "not shown"
      // rather than crash; worst case the intro plays more than once.
    }

    if (alreadyShown) {
      setShow(false);
      return;
    }

    setShow(true);
    try {
      sessionStorage.setItem("tnf-loader-shown", "1");
    } catch {
      // Ignore -- see above.
    }
  }, []);

  // 0 -> 100 counter, paced via rAF so it reads as continuous rather than
  // stepping. Once done, hold briefly, then fade the overlay, then unmount.
  useEffect(() => {
    if (show !== true) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      setPercent(Math.min(100, Math.round((elapsed / COUNT_MS) * 100)));
      if (elapsed < COUNT_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const toFading = setTimeout(
      () => setOverlayPhase("fading"),
      COUNT_MS + HOLD_MS
    );
    const toHidden = setTimeout(
      () => setShow(false),
      COUNT_MS + HOLD_MS + OVERLAY_FADE_MS
    );

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(toFading);
      clearTimeout(toHidden);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-white transition-opacity duration-700 ease-in-out ${
        overlayPhase === "fading" ? "opacity-0" : "opacity-100"
      }`}
      style={{ pointerEvents: overlayPhase === "fading" ? "none" : "auto" }}
      aria-hidden="true"
    >
      <p className="font-mono text-[13px] tabular-nums text-black md:text-[18px]">
        {String(percent).padStart(3, "0")}%
      </p>
    </div>
  );
};

export default SiteLoader;
