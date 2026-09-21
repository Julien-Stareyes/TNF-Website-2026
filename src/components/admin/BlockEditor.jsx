"use client";
import Select from "./Select";
import { ROW_PRESETS } from "@/lib/row-presets";

const uid = () => Math.random().toString(36).slice(2, 9);

export const newTextItem = (over = {}) => ({
  id: uid(),
  kind: "text",
  content: "",
  textAlign: "center",
  align: "center",
  span: 12,
  ...over,
});

export const newMediaItem = (over = {}) => ({
  id: uid(),
  kind: "media",
  url: null,
  mediaType: "image",
  aspect: "auto",
  align: "start",
  span: 12,
  ...over,
});

export const newRow = (over = {}) => ({
  id: uid(),
  width: "wide",
  background: null,
  padY: "md",
  gap: "md",
  items: [newMediaItem()],
  ...over,
});

const WIDTH_OPTIONS = [
  { value: "narrow", label: "Narrow" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full bleed" },
];
const PAD_OPTIONS = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
];
const GAP_OPTIONS = [
  { value: "sm", label: "Tight" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Wide" },
];
// Setting one crops every picture in the row to the same height, which
// is how a portrait and a landscape shot end up aligned.
const MEDIA_HEIGHT_OPTIONS = [
  { value: "auto", label: "Each its own" },
  { value: "short", label: "Match · short" },
  { value: "medium", label: "Match · medium" },
  { value: "tall", label: "Match · tall" },
];

// Structure only. Which item sits where, how wide it is and what media
// it holds are all handled by clicking the item on the live preview —
// this panel is the outline of the page and the styling of each band.
export default function BlockEditor({
  blocks,
  onChange,
  openRowIndex,
  onOpenRow,
}) {
  const patchRow = (ri, patch) =>
    onChange(blocks.map((b, i) => (i === ri ? { ...b, ...patch } : b)));

  const moveRow = (ri, dir) => {
    const to = ri + dir;
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    [next[ri], next[to]] = [next[to], next[ri]];
    onChange(next);
    onOpenRow?.(to);
  };

  const removeRow = (ri) => {
    onChange(blocks.filter((_, i) => i !== ri));
    onOpenRow?.(null);
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="uppercase text-xs tracking-widest text-white/60">
          Page outline
        </h3>
        <p className="text-[10px] text-white/40 mt-1">
          Rows top to bottom · click an item on the preview to edit it
        </p>
      </div>

      <ol className="space-y-1.5">
        {blocks.map((row, ri) => {
          const open = openRowIndex === ri;
          const preset = ROW_PRESETS.find((p) => p.key === row.preset);
          return (
            <li key={row.id ?? ri}>
              <div
                className={`rounded border transition ${
                  open ? "border-white/30 bg-white/[0.04]" : "border-white/10"
                }`}
              >
                <div className="flex items-center gap-2 p-2">
                  <span className="w-5 shrink-0 text-center font-mono text-[10px] text-white/30 tabular-nums">
                    {ri + 1}
                  </span>

                  {/* The row's shape, drawn — faster to recognise than a
                      count of items. */}
                  <Diagram row={row} />

                  <button
                    onClick={() => onOpenRow?.(open ? null : ri)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <span className="block text-[11px] truncate">
                      {preset?.label ?? `${row.items?.length ?? 0} items`}
                    </span>
                    <span className="block text-[10px] text-white/35 truncate">
                      {row.width ?? "wide"}
                      {row.background ? " · tinted" : ""}
                    </span>
                  </button>

                  <IconBtn onClick={() => moveRow(ri, -1)} title="Move up" disabled={ri === 0}>
                    ↑
                  </IconBtn>
                  <IconBtn
                    onClick={() => moveRow(ri, 1)}
                    title="Move down"
                    disabled={ri === blocks.length - 1}
                  >
                    ↓
                  </IconBtn>
                  <IconBtn onClick={() => removeRow(ri)} title="Remove row" danger>
                    ✕
                  </IconBtn>
                </div>

                {open && (
                  <div className="border-t border-white/10 p-3 grid grid-cols-2 gap-3">
                    <Labelled label="Width">
                      <Select
                        value={row.width ?? "wide"}
                        onChange={(v) => patchRow(ri, { width: v })}
                        options={WIDTH_OPTIONS}
                      />
                    </Labelled>
                    <Labelled label="Space above/below">
                      <Select
                        value={row.padY ?? "md"}
                        onChange={(v) => patchRow(ri, { padY: v })}
                        options={PAD_OPTIONS}
                      />
                    </Labelled>
                    <Labelled label="Gap between items">
                      <Select
                        value={row.gap ?? "md"}
                        onChange={(v) => patchRow(ri, { gap: v })}
                        options={GAP_OPTIONS}
                      />
                    </Labelled>
                    <Labelled label="Media heights">
                      <Select
                        value={row.mediaHeight ?? "auto"}
                        onChange={(v) =>
                          patchRow(ri, {
                            mediaHeight: v === "auto" ? null : v,
                          })
                        }
                        options={MEDIA_HEIGHT_OPTIONS}
                      />
                    </Labelled>
                    <Labelled label="Background">
                      <div className="flex items-center gap-2 h-[34px]">
                        <input
                          type="color"
                          value={row.background ?? "#111111"}
                          onChange={(e) =>
                            patchRow(ri, { background: e.target.value })
                          }
                          className="w-8 h-8 bg-transparent border border-white/10 rounded cursor-pointer shrink-0"
                        />
                        <button
                          onClick={() =>
                            patchRow(ri, {
                              background: row.background ? null : "#111111",
                            })
                          }
                          className="text-[10px] uppercase tracking-widest text-white/40 hover:text-white"
                        >
                          {row.background ? "Clear" : "None"}
                        </button>
                      </div>
                    </Labelled>
                  </div>
                )}
              </div>
            </li>
          );
        })}

        {blocks.length === 0 && (
          <li className="text-white/40 text-xs border border-white/10 rounded px-3 py-3">
            No rows yet — add one from the preview.
          </li>
        )}
      </ol>
    </section>
  );
}

// Miniature of the row's column split, tinted when the row has a
// background so the outline reads like the page does.
function Diagram({ row }) {
  const items = row.items ?? [];
  return (
    <span
      className="flex gap-[2px] w-12 h-6 shrink-0 rounded-[2px] p-[3px]"
      style={{ background: row.background ?? "rgba(255,255,255,0.06)" }}
    >
      {items.map((it, i) => (
        <span
          key={it.id ?? i}
          style={{ flexGrow: it.span ?? 12 }}
          className={
            it.kind === "media"
              ? "rounded-[1px] bg-white/70"
              : "rounded-[1px] border border-white/40"
          }
        />
      ))}
    </span>
  );
}

function Labelled({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest text-white/40 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function IconBtn({ children, onClick, title, danger, disabled }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`shrink-0 w-6 h-6 grid place-items-center rounded text-[11px] transition ${
        disabled
          ? "text-white/15 cursor-not-allowed"
          : danger
          ? "text-white/40 hover:text-red-400 hover:bg-white/5"
          : "text-white/40 hover:text-white hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}
