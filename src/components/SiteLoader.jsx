"use client";
import { useEffect, useMemo, useState } from "react";

// First-load-only intro: a white screen with three zones -- "THE NEW FACE"
// pinned top-center (same size as the site header's wordmark), the three
// discipline words (CGI / VFX / Immersive) taking turns center-stage, each
// blurring into focus, holding, then blurring back out before the next one
// starts, and a 0->100% counter running bottom-center in step with the
// whole sequence. Once the last word has blurred out, the whole overlay
// fades away to reveal the page underneath. Shown once per browser session
// (sessionStorage), not on every internal navigation -- template.jsx's page
// transition still handles that separately.
const BRAND_TEXT = "THE NEW FACE";
const LOADER_WORDS = ["CGI", "VFX", "IMMERSIVE", "BRANDING"];

const WORD_FADE_IN_MS = 320;
const WORD_HOLD_MS = 150; // fully visible, before it starts leaving
const WORD_FADE_OUT_MS = 300;
const WORD_TOTAL_MS = WORD_FADE_IN_MS + WORD_HOLD_MS + WORD_FADE_OUT_MS;
const SEQUENCE_MS = LOADER_WORDS.length * WORD_TOTAL_MS; // all 3 words, start to last blur-out
const OVERLAY_FADE_MS = 700; // the white screen's own fade, once the words are done

const SiteLoader = () => {
  // null: still deciding (sessionStorage read is client-only); false: skip
  // entirely (already shown this session, or SSR pass); true: play it.
  const [show, setShow] = useState(null);
  const [overlayPhase, setOverlayPhase] = useState("playing"); // "playing" | "fading"
  const [wordIndex, setWordIndex] = useState(0);
  const [wordPhase, setWordPhase] = useState("in"); // "in" | "out"
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

  // Steps through the three words: each one flips to "in" at its slot's
  // start, then to "out" once its hold ends -- then the overlay itself
  // starts fading once the last word has finished blurring out.
  useEffect(() => {
    if (show !== true) return;

    const timers = [];
    LOADER_WORDS.forEach((_, i) => {
      const slotStart = i * WORD_TOTAL_MS;
      if (i > 0) {
        timers.push(
          setTimeout(() => {
            setWordIndex(i);
            setWordPhase("in");
          }, slotStart)
        );
      }
      timers.push(
        setTimeout(
          () => setWordPhase("out"),
          slotStart + WORD_FADE_IN_MS + WORD_HOLD_MS
        )
      );
    });

    const toFading = setTimeout(() => setOverlayPhase("fading"), SEQUENCE_MS);
    const toHidden = setTimeout(
      () => setShow(false),
      SEQUENCE_MS + OVERLAY_FADE_MS
    );
    timers.push(toFading, toHidden);

    return () => timers.forEach(clearTimeout);
  }, [show]);

  // 0 -> 100 counter, paced against the same sequence duration via rAF so
  // it reads as continuous rather than stepping once per word.
  useEffect(() => {
    if (show !== true) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      setPercent(Math.min(100, Math.round((elapsed / SEQUENCE_MS) * 100)));
      if (elapsed < SEQUENCE_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show]);

  const brandLetters = useMemo(() => BRAND_TEXT, []);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-white transition-opacity duration-700 ease-in-out ${
        overlayPhase === "fading" ? "opacity-0" : "opacity-100"
      }`}
      style={{ pointerEvents: overlayPhase === "fading" ? "none" : "auto" }}
      aria-hidden="true"
    >
      {/* Same size/weight/font as the header's own wordmark (SiteHeader.jsx) */}
      <p className="absolute left-1/2 top-5 -translate-x-1/2 font-mono font-light uppercase leading-none text-[11px] text-black md:top-[2.4vh] md:text-[15px]">
        {brandLetters}
      </p>

      <p
        key={wordIndex}
        className={`font-mono uppercase text-[28px] tracking-[0.1em] text-black md:text-[48px] ${
          wordPhase === "in" ? "tnf-loader-word-in" : "tnf-loader-word-out"
        }`}
      >
        {LOADER_WORDS[wordIndex]}
      </p>

      <p className="absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[11px] tabular-nums text-black md:bottom-[2.4vh] md:text-[13px]">
        {String(percent).padStart(3, "0")}%
      </p>
    </div>
  );
};

export default SiteLoader;
