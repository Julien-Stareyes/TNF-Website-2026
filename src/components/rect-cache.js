// Small helper used by the Liquid effect (canvasui/Liquid.jsx) -- the
// shadcn registry item that ships Liquid.jsx imports this from "../rect-cache"
// but doesn't actually include the file itself, so this is a from-scratch
// implementation matching the interface Liquid.jsx expects:
// `createRectCache(el)` returns `{ current, destroy() }`, where `.current`
// is `el`'s bounding rect, kept fresh without calling
// `getBoundingClientRect()` on every single pointermove (which fires very
// often and forces a synchronous layout read each time) -- it's recomputed
// only on resize/scroll instead, and read cheaply the rest of the time.
export function createRectCache(el) {
  let rect = el.getBoundingClientRect();

  const update = () => {
    rect = el.getBoundingClientRect();
  };

  const ro = new ResizeObserver(update);
  ro.observe(el);
  // `capture: true` so this also catches scrolling on an ancestor, not
  // just the window itself.
  window.addEventListener("scroll", update, true);
  window.addEventListener("resize", update);

  return {
    get current() {
      return rect;
    },
    destroy() {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    },
  };
}
