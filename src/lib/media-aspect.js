"use client";
import { useCallback, useState } from "react";

// Every project in the database carries format '16:9', and there is no
// control in the admin that sets it otherwise, so the stored value says
// nothing about the shape of the file. These read the shape off the media
// element that is already on the page — no second request, and nothing to
// keep up to date by hand.

export const DEFAULT_ASPECT = 16 / 9;

// Measured shapes, kept for the life of the page: the Index preview mounts
// on hover and unmounts on leave, so without this the box would fall back
// to the default and resize again every time the pointer returns.
const seen = new Map();

export const knownAspect = (url) => (url ? seen.get(url) : undefined);

// Handlers for the element itself. Videos report on metadata, images on
// load; either way the natural size is what the file actually is.
export function useAspectProbe(url) {
  const [aspect, setAspect] = useState(() => knownAspect(url) ?? null);

  const read = useCallback(
    (w, h) => {
      if (!w || !h) return;
      const a = w / h;
      if (url) seen.set(url, a);
      setAspect(a);
    },
    [url]
  );

  const onLoadedMetadata = useCallback(
    (e) => read(e.currentTarget.videoWidth, e.currentTarget.videoHeight),
    [read]
  );
  const onLoad = useCallback(
    (e) => read(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight),
    [read]
  );

  // Anything cached — and a data URI always is — finishes loading before
  // React attaches the handler, so the event never arrives. Ask the element
  // directly the moment it mounts.
  const probe = useCallback(
    (el) => {
      if (!el) return;
      if (el.tagName === "VIDEO") {
        if (el.readyState >= 1) read(el.videoWidth, el.videoHeight);
      } else if (el.complete) {
        read(el.naturalWidth, el.naturalHeight);
      }
    },
    [read]
  );

  return {
    aspect: aspect ?? knownAspect(url) ?? null,
    onLoadedMetadata,
    onLoad,
    probe,
  };
}
