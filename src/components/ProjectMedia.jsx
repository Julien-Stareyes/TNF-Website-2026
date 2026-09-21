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
  const [ready, setReady] = useState(false); // actually playing -> drives the fade
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
  // rest costs nothing and cannot be missed.
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

  return (
    <div className="relative size-full">
      {posterSrc && (
        <img
          src={posterSrc}
          alt=""
          style={{
            ...style,
            opacity: ready ? 0 : 1,
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
          // `playing` is a one-shot event, and a cover served from cache
          // can start before React has attached the handler — in which
          // case it never arrives, `ready` stays false, and the poster
          // covers a video that is playing perfectly well underneath it.
          // `timeupdate` keeps coming, so it cannot be missed.
          onPlaying={() => setReady(true)}
          onTimeUpdate={(e) => {
            if (e.currentTarget.currentTime > 0) setReady(true);
          }}
          style={{
            ...style,
            opacity: ready ? 1 : 0,
            transitionProperty: "opacity",
            transitionDuration: `${FADE_MS}ms`,
          }}
          className={`absolute inset-0 size-full object-cover ${className}`}
        />
      )}
    </div>
  );
};

export default ProjectMedia;
