"use client";

// React sets `muted` on a video as a property and never writes the
// attribute. WebKit reads the attribute when it decides whether an inline
// video may play on its own, so on an iPhone every one of ours counted as
// unmuted and was refused — the covers only ever started on a tap.
//
// `defaultMuted` is the property that reflects into the attribute, so
// setting it is what actually puts `muted` in the markup. Attach this as
// the element's ref, or call it from one.
export function markMuted(el) {
  if (!el) return;
  el.defaultMuted = true;
  el.muted = true;
  // Belt and braces: `defaultMuted` is meant to reflect, but the attribute
  // is what actually has to be there.
  if (!el.hasAttribute("muted")) el.setAttribute("muted", "");
}
