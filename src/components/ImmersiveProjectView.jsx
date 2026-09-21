"use client";
import { useEffect, useRef, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { EditModeProvider, Editable, useEditMode } from "@/lib/edit-mode";
import { ROW_PRESETS } from "@/lib/row-presets";
import { markMuted } from "@/lib/muted-video";

// Vertical case-study detail. The page is a stack of rows; each row is a
// 12-column grid the operator fills with media and text, so column
// widths, how many sit side by side, and where copy lands between them
// are all content decisions rather than layout code.
export default function ImmersiveProjectView({ project: initialProject }) {
  const [project, setProject] = useState(initialProject);

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
      <Layout project={project} />
    </EditModeProvider>
  );
}

// Row widths only narrow from md up — on a phone every row runs the full
// width inside the page gutter, otherwise a "narrow" row would be a
// ribbon a few characters wide.
const WIDTHS = {
  full: "max-w-none",
  wide: "md:max-w-[86vw]",
  narrow: "md:max-w-[52vw]",
};
const PAD_Y = { none: "py-0", sm: "py-4 md:py-6", md: "py-8 md:py-14", lg: "py-14 md:py-28" };
const GAPS = { sm: "gap-2", md: "gap-4 md:gap-5", lg: "gap-6 md:gap-10" };

// Is this row's background dark enough that copy on it should default to
// white? Rec. 709 luma on the hex the operator picked.
function isDark(background) {
  if (!background) return false;
  const m = /^#?([a-f\d]{6})$/i.exec(background.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
}

// Matches Tailwind's md breakpoint, so the JS that places grid items
// agrees with the CSS that defines the columns.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

// ---------------------------------------------------------------------------
// Drag-to-reorder for whole rows. The dragged row lifts off the page and
// follows the pointer while its neighbours slide apart to open a gap, so
// the drop target is always the space you can see.
// ---------------------------------------------------------------------------
function useRowDrag(count, onCommit) {
  const refs = useRef([]);
  const [state, setState] = useState(null);

  const start = (index) => (e) => {
    e.preventDefault();
    const heights = refs.current.map((el) => el?.offsetHeight ?? 0);
    // Anchor in document space, not viewport space — otherwise scrolling
    // mid-drag shifts the page under the pointer and the row drifts away
    // from the cursor.
    const startPageY = e.clientY + window.scrollY;
    let lastClientY = e.clientY;
    setState({ index, dy: 0, to: index, heights });

    const apply = () => {
      const dy = lastClientY + window.scrollY - startPageY;
      // Walk outward from the origin, consuming each neighbour's height
      // until the drag no longer reaches past it.
      let to = index;
      if (dy > 0) {
        let travelled = 0;
        for (let i = index + 1; i < count; i++) {
          travelled += heights[i] ?? 0;
          if (dy > travelled - (heights[i] ?? 0) / 2) to = i;
          else break;
        }
      } else if (dy < 0) {
        let travelled = 0;
        for (let i = index - 1; i >= 0; i--) {
          travelled += heights[i] ?? 0;
          if (-dy > travelled - (heights[i] ?? 0) / 2) to = i;
          else break;
        }
      }
      setState((s) => (s ? { ...s, dy, to } : s));
    };

    const move = (ev) => {
      lastClientY = ev.clientY;
      apply();
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("scroll", apply);
      setState((s) => {
        if (s && s.to !== s.index) onCommit(s.index, s.to);
        return null;
      });
      document.body.style.userSelect = "";
    };

    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("scroll", apply, { passive: true });
  };

  // How far a given row should shift to make room for the dragged one.
  const offsetFor = (i) => {
    if (!state || i === state.index) return 0;
    const h = state.heights[state.index] ?? 0;
    if (i > state.index && i <= state.to) return -h;
    if (i < state.index && i >= state.to) return h;
    return 0;
  };

  return {
    active: state,
    start,
    offsetFor,
    register: (i) => (el) => {
      refs.current[i] = el;
    },
  };
}

function Layout({ project }) {
  const { enabled, request } = useEditMode();
  const isMobile = useIsMobile();
  const blocks = project.blocks ?? [];
  const drag = useRowDrag(blocks.length, (from, to) =>
    request("reorder-block", "blocks", { from, to })
  );

  // Only one item carries a toolbar at a time. Showing them on hover put
  // neighbouring toolbars on top of each other; selecting is also how
  // every other editor works. Keyed by the item's own id so reordering
  // doesn't leave the highlight behind on whatever took its index.
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (!enabled) setSelected(null);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  return (
    <div
      className="min-h-screen bg-white text-black overflow-x-hidden"
      onClick={enabled ? () => setSelected(null) : undefined}
    >
      <SiteHeader theme="light" />

      <h1 className="pt-20 md:pt-[16vh] pb-8 md:pb-[8vh] px-5 text-center font-mono uppercase tracking-[0.16em] text-[13px] md:text-[1.15vw]">
        {project.title}
      </h1>

      <div className="flex flex-col items-center pb-24">
        {blocks.map((block, bi) => (
          <Row
            key={block.id ?? bi}
            block={block}
            index={bi}
            drag={drag}
            isMobile={isMobile}
            selected={selected}
            onSelect={setSelected}
          />
        ))}

        {blocks.length === 0 && (
          <p className="py-24 font-mono text-sm text-black/35">
            {enabled
              ? "Empty — add a row from the admin panel."
              : "This project has no content yet."}
          </p>
        )}

        {enabled && <AddRow onAdd={(key) => request("add-block", "blocks", { preset: key })} />}
      </div>
    </div>
  );
}

function Row({ block, index, drag, isMobile, selected, onSelect }) {
  const { enabled, request } = useEditMode();
  const [layoutOpen, setLayoutOpen] = useState(false);
  const gridRef = useRef(null);
  const width = WIDTHS[block.width] ?? WIDTHS.wide;
  const padY = PAD_Y[block.padY] ?? PAD_Y.md;
  const gap = GAPS[block.gap] ?? GAPS.md;

  const dragging = drag?.active?.index === index;
  const offset = drag?.offsetFor?.(index) ?? 0;

  return (
    <section
      ref={drag?.register?.(index)}
      className={`relative w-full ${padY} group/row ${
        dragging ? "z-40" : drag?.active ? "z-0" : ""
      }`}
      style={{
        ...(block.background ? { background: block.background } : null),
        transform: dragging
          ? `translateY(${drag.active.dy}px) scale(0.97)`
          : offset
          ? `translateY(${offset}px)`
          : undefined,
        transition: dragging
          ? "none"
          : "transform 260ms cubic-bezier(0.16,1,0.3,1), box-shadow 200ms",
        boxShadow: dragging ? "0 24px 60px rgba(0,0,0,0.28)" : undefined,
        borderRadius: dragging ? 6 : undefined,
        opacity: dragging ? 0.96 : 1,
        cursor: dragging ? "grabbing" : undefined,
      }}
    >
      {enabled && (
        <Toolbar className="absolute right-4 top-4 z-20 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100">
          <TbHandle onPointerDown={drag?.start?.(index)} title="Drag to reorder row" />
          <TbDivider />
          <TbText onClick={() => setLayoutOpen((v) => !v)} on={layoutOpen}>
            Layout
          </TbText>
          <TbText
            onClick={() => request("edit-block", "blocks", { index })}
            title="Row width, background, padding and spacing"
          >
            Style
          </TbText>
          <TbDivider />
          <TbBtn
            onClick={() => request("remove-block", "blocks", { index })}
            title="Remove row"
            danger
          >
            <Icon.Trash />
          </TbBtn>
        </Toolbar>
      )}

      {enabled && layoutOpen && (
        <div className="mx-auto mb-4 px-5 md:px-[7vw] w-full max-w-[86vw]">
          <div className="border border-dashed border-black/25 bg-white/90 rounded p-3 space-y-2">
            <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-black/45">
              Row layout — media carries over
            </span>
            <PresetGrid
              current={block.preset}
              onPick={(key) => {
                request("set-preset", "blocks", { index, preset: key });
                setLayoutOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* One column on a phone — a twelfth of 390px is unreadable — and
          the full twelve from md up. */}
      <div
        ref={gridRef}
        className={`mx-auto px-5 md:px-[7vw] w-full ${width} grid grid-cols-1 md:grid-cols-12 ${gap} items-start`}
      >
        {(block.items ?? []).map((item, ii) => (
          <Item
            key={item.id ?? ii}
            item={item}
            rowIndex={index}
            itemIndex={ii}
            single={(block.items ?? []).length === 1}
            isMobile={isMobile}
            selected={selected === (item.id ?? `${index}:${ii}`)}
            onSelect={() => onSelect?.(item.id ?? `${index}:${ii}`)}
            onDark={isDark(block.background)}
            gridRef={gridRef}
            mediaHeight={block.mediaHeight}
          />
        ))}

      </div>
    </section>
  );
}

// Picking an arrangement is the first decision — the presets say what a
// row will look like before anything is put in it.
function PresetGrid({ onPick, current }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
      {ROW_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPick(p.key)}
          className={`group/preset text-left rounded border p-2 transition ${
            current === p.key
              ? "border-[#c67a2e] bg-[#c67a2e]/5"
              : "border-black/15 bg-white hover:border-[#c67a2e]"
          }`}
        >
          <span className="flex gap-[3px] h-8 items-stretch">
            {p.slots.map((s, i) => (
              <span
                key={i}
                style={{ flexGrow: s.span }}
                className={
                  s.kind === "m"
                    ? "rounded-[2px] bg-black/70"
                    : "rounded-[2px] border border-black/25 bg-[repeating-linear-gradient(180deg,rgba(0,0,0,0.35)_0_1px,transparent_1px_4px)]"
                }
              />
            ))}
          </span>
          <span className="block mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-black/45 truncate">
            {p.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function AddRow({ onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8 w-full px-5 md:px-[7vw]">
      {open ? (
        <div className="border border-dashed border-black/25 rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/45">
              Pick a layout
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-mono text-[11px] text-black/40 hover:text-black"
            >
              ✕
            </button>
          </div>
          <PresetGrid
            onPick={(key) => {
              onAdd(key);
              setOpen(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full border border-dashed border-black/25 rounded py-8 font-mono text-[12px] uppercase tracking-[0.16em] text-black/40 hover:border-[#c67a2e] hover:text-[#c67a2e] transition"
        >
          + Add row
        </button>
      )}
    </div>
  );
}

// One cell in a row, wrapped with the controls that resize, align and
// remove it. The controls only mount in edit mode, so the public page
// carries none of this.
function Item({
  item,
  rowIndex,
  itemIndex,
  single,
  isMobile,
  selected,
  onSelect,
  onDark,
  gridRef,
  mediaHeight,
}) {
  const { enabled, request } = useEditMode();
  const [repositioning, setRepositioning] = useState(false);
  const span = item.span ?? 12;
  const cropped = item.aspect && item.aspect !== "auto";

  // Drag the edge to resize. The pointer's distance across the row maps
  // straight onto column counts, so the item follows the grid it lives
  // in rather than an abstract number in a toolbar.
  // While dragging, the width follows the pointer in pixels so the motion
  // is continuous, and a local span override drives the grid immediately
  // instead of waiting for the round trip through the admin. On release
  // both are dropped and the item settles onto its column.
  const [resize, setResize] = useState(null); // { width, span, side }
  const liveSpan = resize?.span ?? span;

  const startResize = (side) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const grid = gridRef?.current;
    if (!grid) return;
    const styles = getComputedStyle(grid);
    const rect = grid.getBoundingClientRect();
    const padL = parseFloat(styles.paddingLeft) || 0;
    const padR = parseFloat(styles.paddingRight) || 0;
    const col = (rect.width - padL - padR) / 12;
    const box = e.currentTarget.closest("[data-item]").getBoundingClientRect();
    // Whichever edge is grabbed, the opposite one stays put and the width
    // is read off the pointer's distance from it.
    const anchor = side === "left" ? box.right : box.left;

    let raf = 0;
    let pointerX = side === "left" ? box.left : box.right;
    let lastSent = span;

    const frame = () => {
      raf = 0;
      const distance = side === "left" ? anchor - pointerX : pointerX - anchor;
      const width = Math.max(col, Math.min(col * 12, distance));
      const snapped = Math.max(1, Math.min(12, Math.round(distance / col)));
      setResize({ width, span: snapped, side });
      if (snapped !== lastSent) {
        lastSent = snapped;
        request("item-span-set", "blocks", {
          index: rowIndex,
          itemIndex,
          span: snapped,
        });
      }
    };

    const move = (ev) => {
      pointerX = ev.clientX;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (raf) cancelAnimationFrame(raf);
      setResize(null);
      document.body.style.userSelect = "";
    };

    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Leaving edit mode or dropping the crop should end a repositioning
  // session rather than leave it stuck on.
  useEffect(() => {
    if (!enabled || !cropped) setRepositioning(false);
  }, [enabled, cropped]);

  // A lone item can be pushed around inside the row; with siblings the
  // natural grid order decides placement.
  const start =
    single && item.justify === "center"
      ? Math.floor((12 - span) / 2) + 1
      : single && item.justify === "end"
      ? 12 - span + 1
      : null;

  const ask = (action, payload) =>
    request(action, "blocks", { index: rowIndex, itemIndex, ...payload });

  return (
    <div
      data-item
      className={`relative min-w-0 ${
        enabled
          ? selected
            ? "ring-2 ring-[#c67a2e] ring-offset-2 ring-offset-transparent rounded-[2px]"
            : "hover:ring-1 hover:ring-black/20 hover:ring-offset-2 rounded-[2px] cursor-pointer"
          : ""
      }`}
      onClick={
        enabled
          ? (e) => {
              e.stopPropagation();
              onSelect?.();
            }
          : undefined
      }
      style={{
        // On a phone the grid is a single column, so column placement is
        // left to CSS — naming a start line there would push the item
        // outside the track and overflow the page.
        gridColumn: isMobile
          ? undefined
          : start
          ? `${start} / span ${liveSpan}`
          : `span ${liveSpan} / span ${liveSpan}`,
        // Pixel width only while dragging, so the edge tracks the pointer
        // continuously; dropped on release so the grid takes over again.
        width: resize && !isMobile ? `${resize.width}px` : undefined,
        marginLeft:
          resize?.side === "left" && !isMobile ? "auto" : undefined,
        transition: resize
          ? "none"
          : "width 180ms cubic-bezier(0.16,1,0.3,1)",
        alignSelf:
          item.align === "center"
            ? "center"
            : item.align === "end"
            ? "end"
            : "start",
      }}
    >
      {enabled && selected && !resize && (
        <Toolbar className="absolute -top-10 left-1/2 -translate-x-1/2 w-max z-40">
          {/* A lone item can be placed anywhere across the row; with
              siblings the order decides, so this group becomes reorder. */}
          {single ? (
            <>
              <TbLabel>Place</TbLabel>
              <TbBtn
                onClick={() => ask("item-justify", { justify: "start" })}
                title="Align left"
                on={(item.justify ?? "start") === "start"}
              >
                <Icon.Left />
              </TbBtn>
              <TbBtn
                onClick={() => ask("item-justify", { justify: "center" })}
                title="Centre"
                on={item.justify === "center"}
              >
                <Icon.Centre />
              </TbBtn>
              <TbBtn
                onClick={() => ask("item-justify", { justify: "end" })}
                title="Align right"
                on={item.justify === "end"}
              >
                <Icon.Right />
              </TbBtn>
            </>
          ) : (
            <>
              <TbLabel>Order</TbLabel>
              <TbBtn
                onClick={() => ask("move-item", { dir: -1 })}
                title="Move left"
                disabled={itemIndex === 0}
              >
                <Icon.ArrowLeft />
              </TbBtn>
              <TbBtn onClick={() => ask("move-item", { dir: 1 })} title="Move right">
                <Icon.ArrowRight />
              </TbBtn>
            </>
          )}

          <TbDivider />
          <TbLabel>Align</TbLabel>
          <TbBtn
            onClick={() => ask("item-align", { align: "start" })}
            title="Top"
            on={(item.align ?? "start") === "start"}
          >
            <Icon.Top />
          </TbBtn>
          <TbBtn
            onClick={() => ask("item-align", { align: "center" })}
            title="Middle"
            on={item.align === "center"}
          >
            <Icon.Middle />
          </TbBtn>
          <TbBtn
            onClick={() => ask("item-align", { align: "end" })}
            title="Bottom"
            on={item.align === "end"}
          >
            <Icon.Bottom />
          </TbBtn>

          {item.kind === "text" && (
            <>
              <TbDivider />
              <TbLabel>Text</TbLabel>
              <TbBtn
                onClick={() => ask("item-text-align", { textAlign: "left" })}
                title="Ragged right"
                on={item.textAlign === "left"}
              >
                <Icon.TextLeft />
              </TbBtn>
              <TbBtn
                onClick={() => ask("item-text-align", { textAlign: "center" })}
                title="Centred"
                on={(item.textAlign ?? "center") === "center"}
              >
                <Icon.TextCentre />
              </TbBtn>
              <TbBtn
                onClick={() => ask("item-text-align", { textAlign: "right" })}
                title="Ragged left"
                on={item.textAlign === "right"}
              >
                <Icon.TextRight />
              </TbBtn>
              <TbText
                onClick={() =>
                  ask("cycle-text-colour", { current: item.color ?? "auto" })
                }
                title="Text colour — auto follows the row's background"
              >
                {item.color ?? "auto"}
              </TbText>
            </>
          )}

          {item.kind === "media" && (
            <>
              <TbDivider />
              <TbLabel>Media</TbLabel>
              <TbText
                onClick={() => ask("cycle-aspect", {})}
                title="Cycle crop ratio"
              >
                {item.aspect ?? "auto"}
              </TbText>
              {cropped && (
                <TbBtn
                  onClick={() => setRepositioning((v) => !v)}
                  title={
                    repositioning
                      ? "Done — keep this position"
                      : "Reposition inside the crop"
                  }
                  on={repositioning}
                >
                  {repositioning ? <Icon.Check /> : <Icon.Focus />}
                </TbBtn>
              )}
              <TbBtn onClick={() => ask("pick-block-media", {})} title="Change media">
                <Icon.Swap />
              </TbBtn>
            </>
          )}

          <TbDivider />
          <TbBtn onClick={() => ask("remove-item", {})} title="Remove item" danger>
            <Icon.Trash />
          </TbBtn>
        </Toolbar>
      )}

      {item.kind === "text" ? (
        <TextItem
          item={item}
          onDark={onDark}
          path={`blocks.${rowIndex}.items.${itemIndex}.content`}
        />
      ) : (
        <MediaItem
          item={item}
          onPickEmpty={() => ask("pick-block-media", {})}
          repositioning={repositioning}
          onFocal={(focal) => ask("item-focal", { focal })}
          mediaHeight={mediaHeight}
        />
      )}

      {/* Resize from either edge or any corner, the way you'd expect on a
          canvas. The width in columns reads out while dragging. */}
      {enabled && selected && !isMobile && (
        <>
          <span
            onPointerDown={startResize("left")}
            title="Drag to resize"
            className="absolute top-0 -left-1 w-2 h-full cursor-ew-resize z-30"
          />
          <span
            onPointerDown={startResize("right")}
            title="Drag to resize"
            className="absolute top-0 -right-1 w-2 h-full cursor-ew-resize z-30"
          />
          {[
            { side: "left", pos: "top-0 -left-1 -translate-y-1/2 -ml-[3px]" },
            { side: "left", pos: "bottom-0 -left-1 translate-y-1/2 -ml-[3px]" },
            { side: "right", pos: "top-0 -right-1 -translate-y-1/2 -mr-[3px]" },
            { side: "right", pos: "bottom-0 -right-1 translate-y-1/2 -mr-[3px]" },
          ].map(({ side, pos }) => (
            <span
              key={pos}
              onPointerDown={startResize(side)}
              title="Drag to resize"
              className={`absolute ${pos} w-2.5 h-2.5 rounded-[1px] bg-white border border-[#c67a2e] shadow cursor-ew-resize z-30`}
            />
          ))}
          {resize && (
            <span className="absolute -top-9 left-1/2 -translate-x-1/2 z-40 rounded-full bg-neutral-900/95 px-2.5 py-1 font-mono text-[10px] tabular-nums text-white shadow">
              {liveSpan}/12
            </span>
          )}
        </>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Editing chrome. One dark pill per surface, split into labelled groups
// so each control sits with the thing it belongs to instead of a row of
// identical squares.
// ---------------------------------------------------------------------------
function Toolbar({ children, className = "" }) {
  return (
    <div
      className={`flex items-center gap-0.5 rounded-full bg-neutral-900/95 backdrop-blur px-1.5 py-1 shadow-lg ring-1 ring-white/10 transition ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function TbDivider() {
  return <span className="mx-1 w-px h-4 bg-white/15" />;
}

function TbLabel({ children }) {
  return (
    <span className="px-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/35 select-none">
      {children}
    </span>
  );
}

function TbBtn({ children, onClick, title, on, danger, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-6 h-6 grid place-items-center rounded-full transition ${
        disabled
          ? "text-white/20 cursor-not-allowed"
          : danger
          ? "text-white/60 hover:text-red-400 hover:bg-white/10"
          : on
          ? "bg-[#c67a2e] text-white"
          : "text-white/70 hover:text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function TbText({ children, onClick, title, on }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`h-6 px-2.5 rounded-full font-mono text-[10px] uppercase tracking-[0.14em] transition ${
        on
          ? "bg-[#c67a2e] text-white"
          : "text-white/70 hover:text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function TbHandle({ onPointerDown, title }) {
  return (
    <button
      type="button"
      title={title}
      onPointerDown={onPointerDown}
      className="w-6 h-6 grid place-items-center rounded-full text-white/50 hover:text-white hover:bg-white/10 cursor-grab active:cursor-grabbing transition"
    >
      <Icon.Grip />
    </button>
  );
}

// Small line icons, sized to the 24px buttons above.
const Icon = {
  Grip: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      {[3, 6, 9].map((y) =>
        [4, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />)
      )}
    </svg>
  ),
  Trash: () => (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M2.5 4h9M5.5 4V2.5h3V4M4 4l.5 7.5h5L10 4" />
    </svg>
  ),
  Left: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M2 2v8" /><rect x="4" y="3.5" width="6" height="5" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  Centre: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M6 1v10" opacity="0.5" /><rect x="3" y="3.5" width="6" height="5" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  Right: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M10 2v8" /><rect x="2" y="3.5" width="6" height="5" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  Top: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M2 2h8" /><rect x="3.5" y="4" width="5" height="6" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  Middle: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M1 6h10" opacity="0.5" /><rect x="3.5" y="3" width="5" height="6" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  Bottom: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M2 10h8" /><rect x="3.5" y="2" width="5" height="6" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  ArrowLeft: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 2.5L4 6l3.5 3.5" />
    </svg>
  ),
  ArrowRight: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 2.5L8 6l-3.5 3.5" />
    </svg>
  ),
  Swap: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h7L7.5 2.5M10 8H3l1.5 1.5" />
    </svg>
  ),
  Focus: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M2 4V2h2M8 2h2v2M10 8v2H8M4 10H2V8" /><circle cx="6" cy="6" r="1.4" />
    </svg>
  ),
  Check: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6.5L5 9l4.5-6" />
    </svg>
  ),
  TextLeft: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M2 3h8M2 6h5M2 9h7" />
    </svg>
  ),
  TextCentre: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M2 3h8M3.5 6h5M2.5 9h7" />
    </svg>
  ),
  TextRight: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M2 3h8M5 6h5M3 9h7" />
    </svg>
  ),
};

function TextItem({ item, path, onDark }) {
  const textAlign =
    item.textAlign === "center"
      ? "text-center"
      : item.textAlign === "right"
      ? "text-right"
      : "text-left";
  // Unset colour follows the row: copy on a dark band goes white without
  // anyone having to remember to set it.
  const color =
    item.color === "light"
      ? "#ffffff"
      : item.color === "dark"
      ? "#0a0a0a"
      : onDark
      ? "#ffffff"
      : undefined;
  return (
    <Editable
      as="p"
      multiline
      field={path}
      value={item.content}
      placeholder="Copy"
      className={`font-mono whitespace-pre-line leading-[1.7] text-[12px] md:text-[0.78vw] ${textAlign}`}
      style={{ color }}
    />
  );
}

// Row-level media heights. With one set, every picture in the row is
// cropped to the same height whatever its native ratio — the way to get
// a portrait and a landscape shot to line up.
const MEDIA_HEIGHTS = {
  short: "26vh",
  medium: "38vh",
  tall: "56vh",
};

function MediaItem({ item, onPickEmpty, repositioning, onFocal, mediaHeight }) {
  const { enabled } = useEditMode();
  const isVideo =
    item.mediaType === "video" || /\.(mp4|mov|webm)(\?|$)/i.test(item.url ?? "");
  // An empty slot is the one case where clicking the media itself is
  // useful — there's nothing to select or resize yet. A filled slot is
  // swapped from the toolbar instead, so clicks stay free for layout.
  const clickToFill = enabled && !item.url;
  // A row height wins over the item's own ratio — that's the point of
  // setting one.
  const fixedHeight = MEDIA_HEIGHTS[mediaHeight];
  const cropped = Boolean(fixedHeight) || (item.aspect && item.aspect !== "auto");

  // While repositioning, the focal point follows the pointer live and is
  // only handed back on release.
  const frameRef = useRef(null);
  const [dragFocal, setDragFocal] = useState(null);
  const focal = dragFocal ?? item.focal ?? { x: 0.5, y: 0.5 };

  const pointFrom = (e) => {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const onPointerDown = (e) => {
    if (!repositioning) return;
    e.preventDefault();
    e.stopPropagation();
    const start = pointFrom(e);
    if (start) setDragFocal(start);
    const move = (ev) => {
      const p = pointFrom(ev);
      if (p) setDragFocal(p);
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const p = pointFrom(ev) ?? start;
      setDragFocal(null);
      if (p) onFocal?.(p);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const objectPosition = `${focal.x * 100}% ${focal.y * 100}%`;
  const mediaClass = `w-full ${cropped ? "h-full object-cover" : "h-auto"}`;

  return (
    <figure
      ref={frameRef}
      className={`m-0 relative overflow-hidden ${
        repositioning ? "cursor-move ring-2 ring-[#c67a2e]" : ""
      }`}
      style={{
        height: fixedHeight,
        aspectRatio:
          !fixedHeight && item.aspect && item.aspect !== "auto"
            ? item.aspect
            : undefined,
      }}
      data-tnf-action={clickToFill ? "media" : undefined}
      onClick={clickToFill ? onPickEmpty : undefined}
      onPointerDown={onPointerDown}
      title={
        clickToFill
          ? "Click to pick media"
          : repositioning
          ? "Drag to choose what stays in frame"
          : undefined
      }
    >
      {item.url ? (
        isVideo ? (
          <video
            ref={markMuted}
            src={item.url}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            style={{ objectPosition }}
            className={`${mediaClass} pointer-events-none`}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt=""
            style={{ objectPosition }}
            className={`${mediaClass} pointer-events-none`}
          />
        )
      ) : (
        <div className="w-full aspect-[4/5] grid place-items-center bg-neutral-100 border border-black/10 font-mono text-[10px] uppercase tracking-[0.16em] text-black/30">
          Pick media
        </div>
      )}

      {repositioning && (
        <>
          {/* Rule-of-thirds guides plus a marker on the focal point, so
              the drag reads as choosing a subject rather than nudging. */}
          <span className="absolute inset-0 pointer-events-none border border-white/40 [background:linear-gradient(to_right,transparent_33.33%,rgba(255,255,255,0.25)_33.33%_calc(33.33%+1px),transparent_calc(33.33%+1px)_66.66%,rgba(255,255,255,0.25)_66.66%_calc(66.66%+1px),transparent_calc(66.66%+1px)),linear-gradient(to_bottom,transparent_33.33%,rgba(255,255,255,0.25)_33.33%_calc(33.33%+1px),transparent_calc(33.33%+1px)_66.66%,rgba(255,255,255,0.25)_66.66%_calc(66.66%+1px),transparent_calc(66.66%+1px))]" />
          <span
            className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
            style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
          />
        </>
      )}
    </figure>
  );
}
