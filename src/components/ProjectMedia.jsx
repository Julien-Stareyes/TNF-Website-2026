"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { markMuted } from "@/lib/muted-video";

export const formatAspectClass = (format) =>
  format === "16:9" ? "aspect-video" : format === "4:5" ? "aspect-[4/5]" : "aspect-[9/16]";

// Renders the project's image, cross-fading into its video once `isNear` is
// true (falling back to the image as poster/default otherwise). `style`/
// `className` let callers apply the full-bleed parallax + zoom treatment,
// or a plain contained box.
//
// Only the slide on screen gets a <video> at all. Keeping the neighbours
// mounted and paused to have them ready did fetch them, but three video
// elements exhaust the decoders a phone will hand out: playback was
// refused, and since a refused play() is a rejected promise and nothing
// else, the poster simply sat there. Neighbours are warmed by the caller
// instead, which costs no decoder.
const FADE_MS = 700;

const ProjectMedia = ({
  project,
  isNear,
  isMobile,
  style,
  className = "",
}) => {
  const videoSrc = isMobile
    ? project.videoMobile || project.video
    : project.video;
  const hasVideo = Boolean(videoSrc);
  // The still has to match the cover it stands in for, or the framing
  // jumps the moment the video fades up.
  const posterSrc = isMobile
    ? project.imageMobile || project.image
    : project.image;

  const [mounted, setMounted] = useState(false); // <video> present in the DOM
  // `frameLoaded` reveals the video the moment IT has a real decoded frame
  // to show (currentTime already sits at 0 by default, before any play()
  // call), rather than waiting for confirmed playback -- an earlier
  // version tried to pre-extract the video's first frame onto a canvas
  // via a *second*, hidden <video> pointed at the same file, so it could
  // fade in over the cover photo before the real one had even loaded. Two
  // problems with that: browsers -- Chrome included -- skip decoding
  // frames for a `display: none` video, and even fixed, it doubled the
  // network requests against a source that's already rate-limited under
  // concurrent load (see the project-detail page's thumbnail rail),
  // making the extraction fail more often than not. Revealing this same
  // element early instead means there's only ever one request, and
  // whatever frame it shows is *definitionally* the video's own -- no
  // separate extraction to get wrong.
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [ready, setReady] = useState(false); // actually playing -> logged for the poll below
  const ref = useRef(null);

  // The source is handed over here rather than in the markup, and only
  // once the element is muted. A video mounted by React arrives complete
  // with its `src`, so the browser can weigh up autoplay before a ref has
  // run — and at that moment it is looking at a video with no `muted`
  // attribute, which it will not start. Muting first and pointing it at
  // the file second puts the decision after the fact it depends on.
  const attach = useCallback(
    (el) => {
      ref.current = el;
      if (!el) return;
      markMuted(el);
      if (videoSrc && el.src !== videoSrc) el.src = videoSrc;
    },
    [videoSrc]
  );

  useEffect(() => {
    let timeout;
    if (isNear && hasVideo) {
      timeout = setTimeout(() => setMounted(true), 0);
    } else {
      timeout = setTimeout(() => {
        setReady(false);
        setFrameLoaded(false);
        setMounted(false);
      }, FADE_MS);
    }
    return () => clearTimeout(timeout);
  }, [isNear, hasVideo]);

  // Everything about getting a cover playing, in one place, because every
  // attempt to hang it off a single event has been wrong in some browser:
  //
  //  - `playing` fires once, and a cached cover can start before React has
  //    attached the handler, so the poster stays over a running video;
  //  - a hidden page pauses video and coming back does not resume it;
  //  - a browser may decline autoplay outright, which is a rejected
  //    promise and nothing else;
  //  - iOS will start a declined video from a user gesture, but the slide
  //    you swipe to mounts after the gesture that brought it in.
  //
  // So rather than trust any of them: ask the element how it is actually
  // doing, on a timer, and act on the answer. Two seconds of polling at
  // rest costs nothing and cannot be missed. This no longer gates the
  // cross-fade itself (see `frameLoaded` above) -- it only keeps nudging
  // playback along, so a declined/stalled autoplay still ends up looping
  // once a gesture allows it, instead of sitting frozen on frame one
  // forever.
  useEffect(() => {
    if (!mounted || !isNear) return;

    const check = () => {
      const el = ref.current;
      if (!el || document.hidden) return false;
      if (el.paused) el.play().catch(() => {});
      const running = !el.paused && el.currentTime > 0;
      if (running) setReady(true);
      return running;
    };

    const id = setInterval(() => {
      check();
    }, 250);

    // A gesture is the one thing a browser refusing autoplay will accept,
    // and `move` counts as much as `down`: a swipe brings the next slide
    // in while the finger is still down, so this is what starts it during
    // the swipe rather than on the one after.
    const targets = [
      [document, "visibilitychange"],
      [window, "pageshow"],
      [window, "pointerdown"],
      [window, "pointermove"],
      [window, "touchstart"],
      [window, "touchmove"],
      [window, "keydown"],
      [window, "wheel"],
    ];
    for (const [target, type] of targets)
      target.addEventListener(type, check, { passive: true });

    check();
    return () => {
      clearInterval(id);
      for (const [target, type] of targets)
        target.removeEventListener(type, check);
    };
  }, [mounted, isNear]);

  const videoVisible = frameLoaded || ready;

  return (
    // isolation: isolate works around a Chromium/WebKit bug where a
    // <video> element breaks mix-blend-mode compositing for anything
    // stacked on top of it (the difference-blend index dots and titles
    // over on ScrollScramble.jsx), even while the video is invisible
    // (opacity 0, mid cross-fade). Isolating the video+poster into their
    // own stacking context keeps that bug contained to this box instead
    // of poisoning blend-mode elsewhere on the page.
    <div className="relative size-full" style={{ isolation: "isolate" }}>
      {posterSrc && (
        <img
          src={posterSrc}
          alt=""
          style={{
            ...style,
            opacity: videoVisible ? 0 : 1,
            transitionProperty: "opacity",
            transitionDuration: `${FADE_MS}ms`,
          }}
          className={`absolute inset-0 size-full object-cover ${className}`}
        />
      )}
      {mounted && (
        <video
          key={videoSrc}
          ref={attach}
          muted
          autoPlay
          loop
          playsInline
          preload="auto"
          // Reveal on the first real frame, not on confirmed playback.
          // In principle `currentTime` is still 0 the moment this fires --
          // in practice, on a slower-to-buffer source (a `.mov` export
          // whose index sits at the end of the file behaves this way, and
          // R2's rate limit under concurrent requests makes it worse --
          // see the project-detail page's thumbnail rail), the element
          // can already have crept forward a second or two by the time
          // enough data is finally in and this fires. Snapping back to 0
          // here guarantees frame zero is what actually gets revealed,
          // whatever the buffering story behind it was; loop+autoplay
          // then carries on forward from there exactly as normal.
          onLoadedData={(e) => {
            const el = e.currentTarget;
            if (el.currentTime > 0.05) {
              try {
                el.currentTime = 0;
              } catch {
                // ignore -- worst case it reveals wherever it already was
              }
            }
            setFrameLoaded(true);
          }}
          onPlaying={() => setReady(true)}
          onTimeUpdate={(e) => {
            if (e.currentTarget.currentTime > 0) setReady(true);
          }}
          style={{
            ...style,
            opacity: videoVisible ? 1 : 0,
            transitionProperty: "opacity",
            transitionDuration: `${FADE_MS}ms`,
            // Forces this <video> onto the normal GPU compositing path
            // instead of a hardware video-overlay plane. Overlay-plane
            // video bypasses the browser's blend compositor, which is why
            // the difference-blend index dots/titles over on
            // ScrollScramble.jsx render as flat, unblended white whenever
            // a video like this one sits behind them -- translateZ(0) is
            // the standard trick to opt a video out of overlay
            // compositing so blend modes elsewhere on the page work
            // again.
            transform: "translateZ(0)",
            willChange: "transform",
          }}
          className={`absolute inset-0 size-full object-cover ${className}`}
        />
      )}
    </div>
  );
};

export default ProjectMedia;
