"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SiteHeader from "@/components/SiteHeader";
import { EditModeProvider, Editable, useEditMode } from "@/lib/edit-mode";
import { markMuted } from "@/lib/muted-video";

const isGifUrl = (url) => /\.gif(?:[?#]|$)/i.test(url || "");

// Paints just the first frame of an animated GIF onto a canvas instead of
// letting an <img> play the whole loop -- used for the thumbnail rail,
// where a dozen tiny animating GIFs read as "videos" launching every time
// a project opens. Drawing (not reading back) a cross-origin image onto a
// canvas doesn't need CORS headers on the source, only extracting its
// pixels would -- so this works against the bucket as-is.
const GifFirstFrame = ({ src, className }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth || 1;
      canvas.height = img.naturalHeight || 1;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
};

// A project's own page: thenewface.io/<slug>. One media item fills the
// center of the screen; a small strip of thumbnails scrolls, vertically,
// past a persistent stroke pinned to the vertical centre of the right
// edge, and whichever thumbnail the stroke currently sits on is what's
// shown center-stage. Ported from a reference's "minimap" idea (a fixed
// indicator, content scrolling under/past it) -- only that principle
// carries over, not its code: here it's adapted to React refs/rAF, and
// the item-size/indicator-size are the same so "nearest item to center"
// replaces the reference's overlap-area math.
const ITEM_SIZE = 34; // px -- thumbnail square, and the stroke that matches it
const ITEM_GAP = 10;
const ITEM_STEP = ITEM_SIZE + ITEM_GAP;
const FADE_MS = 400;
// How many thumbnails on either side of the active one actually get a real
// <video>/<img>/gif-canvas mounted -- everything further out renders as an
// empty placeholder cell instead. The rail's own viewport (60vh, capped at
// 420px) only ever shows ~9-10 items at once, so a radius of 6 comfortably
// covers what's visible plus what's about to scroll in; a project with a
// heavy gallery (several videos + gifs) no longer fires every thumbnail's
// network request at once on mount -- only the ones actually near view.
const THUMB_LOAD_RADIUS = 6;

// Shown in the info panel when a project hasn't authored its own copy yet.
const DEFAULT_DESCRIPTION =
  "THE NEW FACE is an expressive research-driven creative practice & think tank within.\n\nWith a focus on experimentation it serves as a framework to drive exploration at the edges of emergent visual and technical cultures.";

const WORD_STEP_MS = 45; // stagger between each word's blur-in

const countWords = (text) => (text || "").split(/\s+/).filter(Boolean).length;

// The info panel's description: word by word, then line by line, each
// blurring into focus with a small stagger -- rather than the paragraph
// just appearing all at once. `openKey` changes every time the panel is
// reopened, remounting these spans so the CSS animation replays instead of
// only firing once on first mount. Falls back to the plain editable field
// while the admin preview's edit mode is on, since splitting the text into
// per-word spans would break typing into it.
const RevealText = ({ field, value, openKey, className }) => {
  const { enabled } = useEditMode();

  if (enabled) {
    return (
      <Editable
        as="p"
        multiline
        field={field}
        value={value}
        className={className}
      />
    );
  }

  const lines = (value || "").split("\n");
  let wordIndex = 0;

  return (
    <p key={openKey} className={className}>
      {lines.map((line, li) => {
        const words = line.split(/\s+/).filter(Boolean);
        return (
          <span key={li} className="block min-h-[1em]">
            {words.map((word, wi) => {
              const delay = wordIndex * WORD_STEP_MS;
              wordIndex += 1;
              // The space has to sit outside the word's own span, not as
              // its last character -- a trailing space at the end of an
              // inline-block box (tnf-word-reveal sets display:
              // inline-block) gets collapsed away by the browser, gluing
              // every word together with no visible gap.
              return (
                <span key={wi}>
                  <span
                    className="tnf-word-reveal"
                    style={{ animationDelay: `${delay}ms` }}
                  >
                    {word}
                  </span>
                  {wi < words.length - 1 ? " " : ""}
                </span>
              );
            })}
          </span>
        );
      })}
    </p>
  );
};

const ProjectView = ({ project: initialProject }) => {
  const [project, setProject] = useState(initialProject);

  // Accept unsaved edits streamed from the admin's live preview.
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === "tnf-preview:project" && e.data.payload)
        setProject((p) => ({ ...p, ...e.data.payload }));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <EditModeProvider>
      <MinimapDetail project={project} />
    </EditModeProvider>
  );
};

// The single center slot. `item` renders under `current` (always fully
// opaque) so an `outgoing` layer stacked on top just has to fade itself
// out to reveal it -- no need to also fade the incoming layer in.
const MediaLayer = ({ item, className = "", style }) => {
  if (!item) return null;

  if (item.video) {
    return (
      <VideoLayer item={item} className={className} style={style} />
    );
  }

  return (
    <div className={`absolute inset-0 ${className}`} style={style}>
      {item.image && (
        <img src={item.image} alt="" className="absolute inset-0 size-full object-contain" />
      )}
    </div>
  );
};

// A video slide + a minimal player: click anywhere to play/pause, a thin
// scrubbable timeline along the bottom, and a mute toggle -- muted by
// default (autoplay requires it) until the person turns sound on
// themselves. No native `controls` chrome; everything here is drawn to
// match the rest of the site (hairline track, plain glyphs, fades in on
// hover rather than sitting on screen the whole time).
const VideoLayer = ({ item, className, style }) => {
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const scrubbingRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0); // 0..1

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };

  // Runs once on mount only (empty deps) -- this used to live inline on
  // the <video> ref instead, but an inline ref callback is a fresh
  // function every render, which React treats as a *new* ref and
  // re-invokes with the same DOM node on every state change. That
  // re-forced `muted = true` right back on after every render, which the
  // mute button's own `setMuted` triggers -- so unmuting silently
  // reverted itself on the very next render. `markMuted` only needs to
  // run once, at mount, to satisfy iOS's autoplay-requires-muted rule.
  useEffect(() => {
    markMuted(videoRef.current);
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    const onTimeUpdate = () => {
      // While a drag is scrubbing, the pointer position drives `progress`
      // instead -- otherwise the video's own timeupdate (still catching
      // up to the seek) would fight the drag every frame.
      if (scrubbingRef.current || !el.duration) return;
      setProgress(el.currentTime / el.duration);
    };
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
  }, []);

  const ratioFromPointer = (clientX) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const onTrackPointerDown = (e) => {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el || !el.duration) return;
    scrubbingRef.current = true;
    const apply = (clientX) => {
      const ratio = ratioFromPointer(clientX);
      setProgress(ratio);
      el.currentTime = ratio * el.duration;
    };
    apply(e.clientX);
    const onMove = (ev) => apply(ev.clientX);
    const onUp = () => {
      scrubbingRef.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className={`absolute inset-0 group/video ${className}`} style={style}>
      <div
        onClick={togglePlay}
        aria-label={paused ? "Play" : "Pause"}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") togglePlay();
        }}
        className="absolute inset-0 size-full cursor-pointer"
      >
        <video
          ref={videoRef}
          src={item.video}
          poster={item.image || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          className="absolute inset-0 size-full object-contain pointer-events-none"
        />
        <span
          className={`pointer-events-none absolute bottom-4 right-4 flex size-9 items-center justify-center rounded-full border border-white/20 bg-black/30 backdrop-blur-sm transition-opacity duration-200 ${
            paused ? "opacity-100" : "opacity-0 group-hover/video:opacity-100"
          }`}
        >
          {paused ? (
            <span className="ml-0.5 h-0 w-0 border-y-[6px] border-y-transparent border-l-[9px] border-l-white" />
          ) : (
            <span className="flex gap-[3px]">
              <span className="h-3 w-[3px] bg-white" />
              <span className="h-3 w-[3px] bg-white" />
            </span>
          )}
        </span>

        {/* Mute toggle -- mirrors the play/pause control, opposite corner. */}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          className="absolute bottom-4 left-4 flex size-9 items-center justify-center rounded-full border border-white/20 bg-black/30 backdrop-blur-sm opacity-0 transition-opacity duration-200 group-hover/video:opacity-100"
        >
          <MuteGlyph muted={muted} />
        </button>

        {/* Timeline -- a hairline track the full width of the slide, a
            little above the two corner controls so the hit areas don't
            overlap. Drag anywhere on it, or click to jump straight there. */}
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          className="absolute inset-x-4 bottom-14 flex h-4 cursor-pointer items-center opacity-0 transition-opacity duration-200 group-hover/video:opacity-100"
        >
          <div className="relative h-[2px] w-full rounded-full bg-white/25">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white"
              style={{ width: `${progress * 100}%` }}
            />
            <div
              className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-white"
              style={{ left: `calc(${progress * 100}% - 4px)` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// Two bars for muted, a small speaker-with-waves glyph for unmuted -- kept
// to plain strokes/shapes, same weight as the play/pause glyph beside it.
const MuteGlyph = ({ muted }) =>
  muted ? (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 5H4L8 1.5V12.5L4 9H1V5Z" fill="white" />
      <path d="M10.5 4.5L13.5 9.5M13.5 4.5L10.5 9.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 5H4L8 1.5V12.5L4 9H1V5Z" fill="white" />
      <path d="M10.3 4.7C11.9 6.3 11.9 7.7 10.3 9.3" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11.8 3.2C14 5.4 14 8.6 11.8 10.8" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );

const MinimapDetail = ({ project }) => {
  const theme = project.theme ?? "dark";

  // Gallery-first, same fallback shape as the old carousel: no authored
  // gallery just means a single "item" made of the project's own cover.
  const mediaItems = useMemo(() => {
    const gallery = (project.gallery || []).map((item) => ({
      format: project.format,
      ...item,
    }));
    if (gallery.length > 0) return gallery;
    return [
      {
        image: project.image,
        imageBg: project.imageBg,
        video: project.video,
        videoMobile: project.videoMobile,
        format: project.format,
      },
    ];
  }, [project]);
  const total = mediaItems.length;

  const [activeIndex, setActiveIndex] = useState(0);
  const [outgoingIndex, setOutgoingIndex] = useState(null);
  const fadeTimeoutRef = useRef(0);
  useEffect(() => () => clearTimeout(fadeTimeoutRef.current), []);

  const setActive = (index) => {
    setActiveIndex((prev) => {
      if (prev === index) return prev;
      setOutgoingIndex(prev);
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = setTimeout(() => setOutgoingIndex(null), FADE_MS);
      return index;
    });
  };

  // --- Minimap physics: a target the drag/wheel/click handlers set, lerped
  // toward every frame so the strip glides rather than jumps. `translateY`
  // is applied straight to the DOM node in the rAF loop (not via state) so
  // 60fps scrolling never round-trips through React.
  const itemsRef = useRef(null);
  const currentTranslateRef = useRef(0);
  const targetTranslateRef = useRef(0);
  const rafRef = useRef(0);
  const isClickMoveRef = useRef(false);
  const dragRef = useRef({ dragging: false, startY: 0, startTranslate: 0 });
  const maxTranslate = Math.max(0, (total - 1) * ITEM_STEP);

  // Reset to the first item whenever the project itself changes (a new
  // slug, or the admin preview swapping in a different gallery).
  useEffect(() => {
    setActiveIndex(0);
    setOutgoingIndex(null);
    setLoadedIndices(new Set([0]));
    targetTranslateRef.current = 0;
    currentTranslateRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.slug]);

  // Which rail thumbnails have ever come within THUMB_LOAD_RADIUS of the
  // active one -- once an index is added it's never removed, so a
  // thumbnail that's already loaded stays mounted even after scrolling
  // past it. A plain distance-from-active check (no memory) would instead
  // unmount it the moment it left the radius and re-fetch it from scratch
  // the next time it came back in range -- fine going straight through
  // once, but a scroll-back-and-forth would repeatedly re-trigger the
  // exact request burst this was meant to avoid.
  const [loadedIndices, setLoadedIndices] = useState(() => new Set([0]));
  useEffect(() => {
    setLoadedIndices((prev) => {
      const lo = Math.max(0, activeIndex - THUMB_LOAD_RADIUS);
      const hi = Math.min(total - 1, activeIndex + THUMB_LOAD_RADIUS);
      let changed = false;
      const next = new Set(prev);
      for (let i = lo; i <= hi; i += 1) {
        if (!next.has(i)) {
          next.add(i);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeIndex, total]);

  useEffect(() => {
    if (total <= 1) return undefined;
    const lerp = (a, b, t) => a + (b - a) * t;

    const tick = () => {
      const factor = isClickMoveRef.current ? 0.16 : 0.2;
      currentTranslateRef.current = lerp(
        currentTranslateRef.current,
        targetTranslateRef.current,
        factor
      );
      if (Math.abs(targetTranslateRef.current - currentTranslateRef.current) < 0.3) {
        currentTranslateRef.current = targetTranslateRef.current;
        isClickMoveRef.current = false;
      }
      if (itemsRef.current) {
        // CSS resolves vertical padding percentages against the
        // containing block's WIDTH, never its height (a longstanding box-
        // model quirk) -- the padding-based centering trick the old
        // horizontal strip used can't carry over to this vertical one.
        // Reading the scroll viewport's actual height every frame (cheap;
        // already inside a rAF loop) and folding half of it into the
        // transform gets the same "first item's centre starts under the
        // fixed stroke" result, and stays correct across any viewport size.
        const viewport = itemsRef.current.parentElement;
        const baseOffset = viewport ? viewport.clientHeight / 2 - ITEM_SIZE / 2 : 0;
        itemsRef.current.style.transform = `translateY(${baseOffset + currentTranslateRef.current}px)`;
      }
      // Item size === indicator size, so "nearest item to the (fixed,
      // centered) stroke" is just the nearest step -- no overlap math
      // needed.
      const index = Math.round(-currentTranslateRef.current / ITEM_STEP);
      setActive(Math.max(0, Math.min(total - 1, index)));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const clampTarget = (v) => Math.max(-maxTranslate, Math.min(0, v));

  // On the last item, the info panel doesn't pop open on the very next
  // wheel tick -- it takes a deliberate scroll (roughly a full viewport's
  // worth) past the end, accumulated across wheel events, before it
  // reveals itself. Scrolling back before reaching that lets go of the
  // progress instead of committing to opening.
  const overscrollRef = useRef(0);

  // Wheel is bound to the whole page (a plain useEffect listener, not a
  // JSX onWheel on the strip) -- this page has no vertical scroll of its
  // own, so any scroll gesture anywhere on it should drive the gallery,
  // not just one hovered over the small strip at the bottom. `passive:
  // false` is required for `preventDefault()` to actually stop the
  // browser's own scroll/bounce. Plain continuous mapping (not a
  // one-step-per-gesture lock) -- just a slower multiplier than a 1:1
  // scroll would give.
  useEffect(() => {
    // No `total <= 1` bail here (unlike the rail's own rAF loop just above)
    // -- a single-item project still needs the wheel listener attached,
    // otherwise scrolling did nothing at all and the info panel (the
    // description text) could never be reached. With one item,
    // `targetTranslateRef` never moves off 0 (`maxTranslate` is 0), so
    // `atIndex` below is always `0 === total - 1`, and every scroll --
    // forward or back -- goes straight into the overscroll-to-reveal-info
    // branch, which is exactly what's wanted when there's nowhere else to
    // scroll to.
    const onWheel = (e) => {
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

      // On the last item with the info panel open, the first backward
      // scroll just closes the panel instead of also moving the gallery --
      // scrolling up again afterwards then steps back through media
      // normally. `infoOpenRef` (kept in sync with the `infoOpen` state
      // below) is read here rather than the state itself, since this
      // listener is only attached once (deps: [total]) and a stale closure
      // over `infoOpen` would never see it change.
      const atIndex = Math.round(-targetTranslateRef.current / ITEM_STEP);
      const scrollingBack = delta < 0;
      const scrollingForward = delta > 0;
      const OVERSCROLL_THRESHOLD =
        typeof window !== "undefined" ? window.innerHeight : 800;

      if (atIndex === total - 1 && scrollingForward) {
        // Already open: nothing left to move to or accumulate.
        if (infoOpenRef.current) return;
        overscrollRef.current = Math.min(
          OVERSCROLL_THRESHOLD,
          overscrollRef.current + Math.abs(delta)
        );
        if (overscrollRef.current >= OVERSCROLL_THRESHOLD) {
          infoOpenRef.current = true;
          openInfo();
        }
        return;
      }

      if (atIndex === total - 1 && scrollingBack) {
        if (infoOpenRef.current) {
          infoOpenRef.current = false;
          overscrollRef.current = 0;
          setInfoOpen(false);
          return;
        }
        if (overscrollRef.current > 0) {
          overscrollRef.current = Math.max(0, overscrollRef.current - Math.abs(delta));
          return;
        }
      }

      isClickMoveRef.current = false;
      targetTranslateRef.current = clampTarget(targetTranslateRef.current - delta * 0.22);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const onPointerDown = (e) => {
    if (total <= 1) return;
    dragRef.current = {
      dragging: true,
      startY: e.clientY,
      startTranslate: targetTranslateRef.current,
    };
    isClickMoveRef.current = false;
  };
  const onPointerMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dy = e.clientY - dragRef.current.startY;
    targetTranslateRef.current = clampTarget(dragRef.current.startTranslate + dy);
  };
  const endDrag = () => {
    dragRef.current.dragging = false;
  };
  const goTo = (index) => {
    isClickMoveRef.current = true;
    targetTranslateRef.current = clampTarget(-index * ITEM_STEP);
  };

  // Header/title-bar portal -- same reason SiteHeader now portals itself:
  // this page's own backdrop/media wrapper can otherwise become the
  // containing block for a `position: fixed` child, breaking it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The info panel: description + Domaine/Date, toggled by the title's
  // "+" (which becomes "—" while it's open) at any time. `openCount` bumps
  // each time it opens, so the word/line/row reveal (keyed off it) replays
  // instead of only animating in once on first mount.
  const [infoOpen, setInfoOpen] = useState(false);
  const infoOpenRef = useRef(false);
  useEffect(() => {
    infoOpenRef.current = infoOpen;
  }, [infoOpen]);
  const [openCount, setOpenCount] = useState(0);
  const openInfo = () => {
    setInfoOpen((wasOpen) => {
      if (!wasOpen) setOpenCount((c) => c + 1);
      return true;
    });
  };
  const toggleInfo = () => {
    setInfoOpen((v) => {
      const next = !v;
      if (next) setOpenCount((c) => c + 1);
      return next;
    });
  };

  const bgImage = project.bgImageUrl || project.imageBg || project.image;
  const current = mediaItems[activeIndex];
  const outgoing = outgoingIndex !== null ? mediaItems[outgoingIndex] : null;

  const titleBar = mounted
    ? createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[105] flex justify-center px-5 pt-5 md:pt-[2.4vh]">
          <button
            type="button"
            onClick={toggleInfo}
            aria-expanded={infoOpen}
            className="pointer-events-auto flex items-center gap-3 font-mono uppercase leading-none text-[11px] md:text-[15px] text-white [mix-blend-mode:difference]"
          >
            <Editable as="span" field="title" value={project.title} />
            <span aria-hidden="true" className="text-[14px] md:text-[18px] opacity-70">
              {infoOpen ? "—" : "+"}
            </span>
          </button>
        </div>,
        document.body
      )
    : null;

  return (
    <div
      className="relative w-full h-[100svh] overflow-hidden bg-black"
      style={project.bgColor ? { backgroundColor: project.bgColor } : undefined}
    >
      {bgImage && (
        <img
          src={bgImage}
          alt=""
          className="absolute inset-0 size-full object-cover blur-2xl scale-110 opacity-50"
        />
      )}

      <SiteHeader theme={theme} shiftDown={infoOpen} />
      {titleBar}

      {/* Center media -- current sits underneath at full opacity; the
          outgoing item, if any, is stacked on top and blur-fades itself
          out (see `.tnf-media-fade-out` in globals.css), revealing current
          rather than the other way around. */}
      <div
        className={`absolute inset-0 flex items-center justify-center px-6 md:px-12 py-[14vh] transition-transform duration-[900ms] ease-in-out ${
          infoOpen ? "translate-y-[22vh] md:translate-y-[26vh]" : "translate-y-0"
        }`}
      >
        <div className="relative w-full h-full max-w-[92vw] md:max-w-[76vw]">
          <MediaLayer item={current} />
          {outgoing && <MediaLayer item={outgoing} className="tnf-media-fade-out" />}
        </div>
      </div>

      {/* Info panel -- description + Domaine/Date, toggled by the title's
          "+"/"—". Anchored under the title (top), not the bottom of the
          site -- it drops down from the name, not up from the minimap.
          Always rendered (not just while open) so opacity/translate can
          transition instead of popping in. */}
      <div
        className={`absolute inset-x-0 top-12 md:top-14 z-30 flex justify-center px-5 transition-all duration-300 ease-out ${
          infoOpen
            ? "opacity-100 translate-y-0"
            : "pointer-events-none opacity-0 -translate-y-2"
        }`}
      >
        <div className="w-full max-w-xl p-6 md:p-8">
          <RevealText
            field="description"
            value={project.description || DEFAULT_DESCRIPTION}
            openKey={openCount}
            className="font-mono text-[12px] md:text-[13px] leading-relaxed text-white text-center"
          />
          {project.category && (
            <div
              key={`cat-${openCount}`}
              className="tnf-block-reveal flex items-center justify-between pt-3 mt-6 font-mono text-[12px]"
              style={{
                animationDelay: `${
                  countWords(project.description || DEFAULT_DESCRIPTION) * WORD_STEP_MS + 200
                }ms`,
              }}
            >
              <span className="uppercase text-white/50">Domaine</span>
              <span className="text-white">{project.category}</span>
            </div>
          )}
          {project.year && (
            <div
              key={`date-${openCount}`}
              className="tnf-block-reveal flex items-center justify-between border-t border-white/10 pt-3 mt-3 font-mono text-[12px]"
              style={{
                animationDelay: `${
                  countWords(project.description || DEFAULT_DESCRIPTION) * WORD_STEP_MS + 350
                }ms`,
              }}
            >
              <span className="uppercase text-white/50">Date</span>
              <span className="text-white">{project.year}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right-edge minimap -- persistent stroke, thumbnails scroll past it
          vertically. Flush to the window edge (right-0), vertically
          centred, with the SAME side padding as SiteHeader's own edge
          content (px-5 / md:px-[2.4vw]) creating the gap -- not offset in
          from the edge the way a `right-*` position would be. Stays put
          regardless of the info panel (unlike the center media, which
          still slides down) -- it no longer slides away/disappears. */}
      {total > 1 && (
        <div className="absolute inset-y-0 right-0 z-20 flex items-center pr-5 md:pr-[2.4vw]">
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            className="relative h-[60vh] max-h-[420px] overflow-hidden cursor-grab active:cursor-grabbing"
            style={{ width: ITEM_SIZE, touchAction: "none" }}
          >
            <div
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 border border-white z-10"
              style={{ width: ITEM_SIZE, height: ITEM_SIZE }}
            />
            <div
              ref={itemsRef}
              className="absolute top-0 left-0 flex flex-col"
              style={{ gap: ITEM_GAP }}
            >
              {mediaItems.map((item, i) => {
                const isLoaded = loadedIndices.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goTo(i)}
                    style={{ width: ITEM_SIZE, height: ITEM_SIZE }}
                    className="shrink-0 overflow-hidden select-none bg-white/5"
                  >
                    {isLoaded &&
                      (item.image ? (
                        isGifUrl(item.image) ? (
                          // A plain <img> would animate the whole GIF right
                          // there in the rail -- same "video playing in a tiny
                          // square" complaint as the <video> case below, just
                          // via a different file type. First frame only.
                          <GifFirstFrame src={item.image} className="size-full object-cover" />
                        ) : (
                          <img src={item.image} alt="" draggable={false} className="size-full object-cover" />
                        )
                      ) : (
                        item.video && (
                          // No autoplaying <video> here -- there can be a dozen
                          // of these squares in the rail at once, and looping
                          // every one of them would mean a dozen live decoders
                          // for something the size of a stamp. `#t=0.1` makes
                          // the browser seek to (and decode) just that one
                          // frame for its poster, the same "first frame" the
                          // main slide shows, without ever calling play() --
                          // as light as a plain <img> thumbnail.
                          <video
                            src={`${item.video}#t=0.1`}
                            preload="metadata"
                            muted
                            playsInline
                            disableRemotePlayback
                            aria-hidden="true"
                            className="size-full object-cover pointer-events-none"
                          />
                        )
                      ))}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectView;
