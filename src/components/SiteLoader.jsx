"use client";
import { useEffect, useMemo, useState } from "react";

// First-load-only intro: a white screen with the studio's own line, each
// letter blurring into focus, then -- after a short hold -- blurring back
// out letter by letter, before the whole overlay fades away to reveal the
// page underneath. Shown once per browser session (sessionStorage), not on
// every internal navigation -- template.jsx's page transition still
// handles that separately.
const LOADER_TEXT = "CGI, Immersive, VFX";

const LETTER_STEP_IN = 45; // ms between each letter's blur-in start
const LETTER_DURATION_IN = 500;
const HOLD_MS = 550; // fully visible, before the letters start leaving
const LETTER_STEP_OUT = 35;
const LETTER_DURATION_OUT = 450;
const OVERLAY_FADE_MS = 700; // the white screen's own fade, once letters are gone

const SiteLoader = () => {
  // null: still deciding (sessionStorage read is client-only); false: skip
  // entirely (already shown this session, or SSR pass); true: play it.
  const [show, setShow] = useState(null);
  const [phase, setPhase] = useState("in"); // "in" | "out" | "fading"

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

    const letterCount = LOADER_TEXT.length;
    const inTotal = letterCount * LETTER_STEP_IN + LETTER_DURATION_IN;
    const outStart = inTotal + HOLD_MS;
    const outTotal = letterCount * LETTER_STEP_OUT + LETTER_DURATION_OUT;
    const fadeStart = outStart + outTotal;

    const toOut = setTimeout(() => setPhase("out"), outStart);
    const toFading = setTimeout(() => setPhase("fading"), fadeStart);
    const toHidden = setTimeout(() => setShow(false), fadeStart + OVERLAY_FADE_MS);

    return () => {
      clearTimeout(toOut);
      clearTimeout(toFading);
      clearTimeout(toHidden);
    };
  }, []);

  const letters = useMemo(() => LOADER_TEXT.split(""), []);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-white transition-opacity duration-700 ease-in-out ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
      style={{ pointerEvents: phase === "fading" ? "none" : "auto" }}
      aria-hidden="true"
    >
      <p className="font-mono uppercase text-[13px] tracking-[0.1em] text-black md:text-[18px]">
        {letters.map((ch, i) => (
          <span
            key={i}
            className={
              phase === "in" ? "tnf-loader-letter-in" : "tnf-loader-letter-out"
            }
            style={{
              animationDelay: `${
                (phase === "in" ? i * LETTER_STEP_IN : i * LETTER_STEP_OUT)
              }ms`,
            }}
          >
            {ch === " " ? " " : ch}
          </span>
        ))}
      </p>
    </div>
  );
};

export default SiteLoader;
