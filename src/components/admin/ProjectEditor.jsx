"use client";
import { useState } from "react";
import UploadField from "./UploadField";
import MediaTile from "./MediaTile";
import Select from "./Select";
import ColorPicker from "./ColorPicker";
import SplitPreview from "./SplitPreview";
import MediaPicker from "./MediaPicker";
import BlockEditor, { newRow, newTextItem, newMediaItem } from "./BlockEditor";
import { ROW_PRESETS, applyPreset } from "@/lib/row-presets";
import { SortableList } from "./SortableList";

// Full-screen modal that lets an operator manage every field on a project,
// including which public tabs it appears on and its per-tab media.
export default function ProjectEditor({ project, onClose, onChange }) {
  const [form, setForm] = useState({
    slug: project.slug,
    title: project.title,
    // Seeds from the title for any project saved before this field
    // existed (or created without one) -- independent from then on.
    brand: project.brand ?? project.title ?? "",
    description: project.description ?? "",
    format: project.format ?? "16:9",
    imageFullScreen: project.imageFullScreen ?? true,
    theme: project.theme ?? "dark",
    completedAt: project.completedAt ?? "",
    category: project.category ?? "",
    technologies: project.technologies ?? "",
    posterUrl: project.posterUrl ?? "",
    bgImageUrl: project.bgImageUrl ?? "",
    bgColor: project.bgColor ?? "",
    gallery: project.gallery ?? [],
    isPublished: project.isPublished ?? true,
    imageCoverDesktopUrl: project.imageCoverDesktopUrl ?? "",
    imageCoverMobileUrl: project.imageCoverMobileUrl ?? "",
    imageCoverBlurUrl: project.imageCoverBlurUrl ?? "",
    detailMode: project.detailMode ?? "image",
    blocks: project.blocks ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [openRow, setOpenRow] = useState(null);
  // Which block item a media pick is targeting, when the pick came from
  // clicking straight on the preview.
  const [blockPick, setBlockPick] = useState(null);
  const [picking, setPicking] = useState(false);
  const isImmersive = form.detailMode === "immersive";

  // The `year` column is what the Index actually renders — keep it in sync
  // with whichever completion date the operator picks, so the two never
  // disagree in the UI.
  const derivedYear = form.completedAt
    ? Number(form.completedAt.slice(0, 4))
    : null;

  const save = async () => {
    setSaving(true);
    const body = {
      ...form,
      completedAt: form.completedAt || null,
      year: derivedYear,
    };
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const saved = res.ok ? await res.json().catch(() => null) : null;
    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString());
    // Hand back the saved row so the dashboard can follow a renamed slug
    // — the URL keys on it, and a stale one would close the editor.
    onChange?.(saved);
    // The editor is a working surface, not a dialog — stay open after a
    // save so the operator can carry on.
  };

  // --- Visual editing from the preview iframe --------------------------
  // Top-level fields (title, description) arrive by name; block copy
  // arrives as a path into the row/item tree.
  const onInlineEdit = (path, value) => {
    if (path === "title" || path === "description")
      return setForm((f) => ({ ...f, [path]: value }));
    const m = /^blocks\.(\d+)\.items\.(\d+)\.content$/.exec(path);
    if (!m) return;
    const [ri, ii] = [Number(m[1]), Number(m[2])];
    setForm((f) => ({
      ...f,
      blocks: f.blocks.map((b, i) =>
        i !== ri
          ? b
          : {
              ...b,
              items: b.items.map((it, j) =>
                j === ii ? { ...it, content: value } : it
              ),
            }
      ),
    }));
  };

  // Rewrite one item inside one row, leaving everything else untouched.
  const patchItem = (ri, ii, patch) =>
    setForm((f) => ({
      ...f,
      blocks: f.blocks.map((b, i) =>
        i !== ri
          ? b
          : {
              ...b,
              items: b.items.map((it, j) =>
                j === ii ? { ...it, ...patch } : it
              ),
            }
      ),
    }));

  const ASPECTS = ["auto", "16/9", "4/5", "9/16", "1/1"];

  const handleBlockRequest = (action, _field, payload = {}) => {
    const { index, itemIndex } = payload;

    switch (action) {
      case "add-block": {
        const preset =
          ROW_PRESETS.find((p) => p.key === payload.preset) ?? ROW_PRESETS[0];
        const row = applyPreset(newRow({ items: [] }), preset, {
          newMedia: newMediaItem,
          newText: newTextItem,
        });
        return setForm((f) => ({ ...f, blocks: [...f.blocks, row] }));
      }

      case "set-preset": {
        const preset = ROW_PRESETS.find((p) => p.key === payload.preset);
        if (!preset) return;
        return setForm((f) => ({
          ...f,
          blocks: f.blocks.map((b, i) =>
            i !== index
              ? b
              : applyPreset(b, preset, {
                  newMedia: newMediaItem,
                  newText: newTextItem,
                })
          ),
        }));
      }

      case "item-focal":
        return patchItem(index, itemIndex, { focal: payload.focal });

      case "remove-block":
        return setForm((f) => ({
          ...f,
          blocks: f.blocks.filter((_, i) => i !== index),
        }));

      case "edit-block":
        return setOpenRow(index);

      case "move-block":
        return setForm((f) => {
          const to = index + payload.dir;
          if (to < 0 || to >= f.blocks.length) return f;
          const blocks = [...f.blocks];
          [blocks[index], blocks[to]] = [blocks[to], blocks[index]];
          return { ...f, blocks };
        });

      case "reorder-block":
        // Drag-and-drop lands a row at an arbitrary index, so this
        // splices rather than swapping with a neighbour.
        return setForm((f) => {
          const { from, to } = payload;
          if (from === to || to == null) return f;
          const blocks = [...f.blocks];
          const [moved] = blocks.splice(from, 1);
          blocks.splice(to, 0, moved);
          return { ...f, blocks };
        });

      case "add-item":
        return setForm((f) => ({
          ...f,
          blocks: f.blocks.map((b, i) => {
            if (i !== index) return b;
            const make = payload.kind === "text" ? newTextItem : newMediaItem;
            const free =
              12 - b.items.reduce((n, it) => n + (it.span ?? 12), 0);
            // Fill the free columns, or halve the widest sibling when the
            // row is already full — a row never wraps to a second line.
            if (free >= 2)
              return { ...b, items: [...b.items, make({ span: free })] };
            let widest = 0;
            b.items.forEach((it, j) => {
              if ((it.span ?? 12) > (b.items[widest].span ?? 12)) widest = j;
            });
            const donor = b.items[widest].span ?? 12;
            if (donor < 2) return b;
            const give = Math.floor(donor / 2);
            return {
              ...b,
              items: [
                ...b.items.map((it, j) =>
                  j === widest ? { ...it, span: donor - give } : it
                ),
                make({ span: give }),
              ],
            };
          }),
        }));

      case "remove-item":
        return setForm((f) => ({
          ...f,
          blocks: f.blocks.map((b, i) =>
            i !== index
              ? b
              : { ...b, items: b.items.filter((_, j) => j !== itemIndex) }
          ),
        }));

      case "move-item":
        return setForm((f) => ({
          ...f,
          blocks: f.blocks.map((b, i) => {
            if (i !== index) return b;
            const to = itemIndex + payload.dir;
            if (to < 0 || to >= b.items.length) return b;
            const items = [...b.items];
            [items[itemIndex], items[to]] = [items[to], items[itemIndex]];
            return { ...b, items };
          }),
        }));

      case "item-span": {
        // A row is twelve columns wide and must stay on one line, so an
        // item can only grow into whatever its siblings aren't using.
        const row = form.blocks[index];
        const current = row?.items?.[itemIndex]?.span ?? 12;
        const taken = (row?.items ?? []).reduce(
          (n, it, i) => (i === itemIndex ? n : n + (it.span ?? 12)),
          0
        );
        const span = Math.min(
          Math.max(1, 12 - taken),
          Math.max(1, current + payload.delta)
        );
        return patchItem(index, itemIndex, { span });
      }

      case "item-span-set": {
        // Edge-drag sends an absolute width; still clamp to what the
        // siblings leave free so the row can't wrap.
        const row = form.blocks[index];
        const taken = (row?.items ?? []).reduce(
          (n, it, i) => (i === itemIndex ? n : n + (it.span ?? 12)),
          0
        );
        return patchItem(index, itemIndex, {
          span: Math.min(Math.max(1, 12 - taken), Math.max(1, payload.span)),
        });
      }

      case "item-justify":
        return patchItem(index, itemIndex, { justify: payload.justify });

      case "item-align":
        return patchItem(index, itemIndex, { align: payload.align });

      case "item-text-align":
        return patchItem(index, itemIndex, { textAlign: payload.textAlign });

      case "cycle-text-colour": {
        // auto → light → dark → auto. "auto" means follow the row's
        // background, which is right most of the time.
        const order = ["auto", "light", "dark"];
        const next =
          order[(order.indexOf(payload.current ?? "auto") + 1) % order.length];
        return patchItem(index, itemIndex, {
          color: next === "auto" ? null : next,
        });
      }

      case "cycle-aspect": {
        const current = form.blocks[index]?.items?.[itemIndex]?.aspect ?? "auto";
        const next = ASPECTS[(ASPECTS.indexOf(current) + 1) % ASPECTS.length];
        return patchItem(index, itemIndex, { aspect: next });
      }

      case "pick-block-media":
        setOpenRow(index);
        setBlockPick({ index, itemIndex });
        return setPicking(true);
    }
  };

  const del = async () => {
    if (!confirm(`Delete "${project.title}"? This can't be undone.`)) return;
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    onChange?.();
    onClose();
  };

  const updateGalleryItem = (idx, next) => {
    setForm((f) => ({
      ...f,
      gallery: f.gallery.map((it, i) => (i === idx ? next : it)),
    }));
  };
  const removeGalleryItem = (idx) => {
    setForm((f) => ({
      ...f,
      gallery: f.gallery.filter((_, i) => i !== idx),
    }));
  };
  const reorderGallery = (newIds) => {
    setForm((f) => {
      const byId = new Map(f.gallery.map((it, i) => [`g-${i}-${it.url}`, it]));
      const next = newIds.map((id) => byId.get(id)).filter(Boolean);
      return { ...f, gallery: next };
    });
  };
  const addGalleryItem = (item) => {
    setForm((f) => ({ ...f, gallery: [...f.gallery, item] }));
  };

  const body = (
    <>
        {/* --- Detail layout --- */}
        <section className="border border-white/10 rounded p-3 space-y-3">
          <div>
            <h3 className="uppercase text-xs tracking-widest text-white/60">
              Detail page layout
            </h3>
            <p className="text-[10px] text-white/40 mt-1">
              How /{form.slug} renders when someone opens the project
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ModeCard
              label="Image"
              hint="Horizontal card carousel"
              on={!isImmersive}
              onClick={() => setForm({ ...form, detailMode: "image" })}
            />
            <ModeCard
              label="Immersive"
              hint="Vertical case study"
              on={isImmersive}
              onClick={() => setForm({ ...form, detailMode: "immersive" })}
            />
          </div>

          {isImmersive && (
            <BlockEditor
              blocks={form.blocks}
              onChange={(blocks) => setForm((f) => ({ ...f, blocks }))}
              openRowIndex={openRow}
              onOpenRow={setOpenRow}
            />
          )}
        </section>

        {/* --- Core fields --- */}
        <section className="grid grid-cols-2 gap-4">
          <Field label="Slug">
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Title">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Marque">
            <input
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              className="input"
            />
            <span className="block text-[10px] text-white/40 mt-1">
              Cursor label on the Image carousel — everywhere else (the
              right-edge index, this dashboard) still shows Title.
            </span>
          </Field>
          <Field label="Completed on">
            <input
              type="date"
              value={form.completedAt || ""}
              onChange={(e) =>
                setForm({ ...form, completedAt: e.target.value })
              }
              className="input"
            />
            <span className="block text-[10px] text-white/40 mt-1">
              Index shows only the year ({derivedYear ?? "—"}) but sorts by full date.
            </span>
          </Field>
          <Field label="What was made">
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="input"
              placeholder="Branding, Website"
            />
            <span className="block text-[10px] text-white/40 mt-1">
              Third column of the Index. Comma-separated, shown as written.
            </span>
          </Field>
          <Field label="Technologies">
            <input
              value={form.technologies}
              onChange={(e) =>
                setForm({ ...form, technologies: e.target.value })
              }
              className="input"
              placeholder="Sanity, Next.js, Gsap"
            />
            <span className="block text-[10px] text-white/40 mt-1">
              Last column of the Index. Comma-separated, shown as written.
            </span>
          </Field>
          <Field label="Theme (overlay text)">
            <Select
              value={form.theme}
              onChange={(v) => setForm({ ...form, theme: v })}
              options={[
                { value: "dark", label: "dark (white text)" },
                { value: "light", label: "light (black text)" },
              ]}
            />
          </Field>
          <Field label="Description" wide>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={4}
              className="input"
            />
          </Field>
        </section>

        {/* --- Image tab covers --- */}
        <section className="space-y-3">
          <h3 className="uppercase text-xs tracking-widest text-white/60">
            Image tab — list-view covers
          </h3>
          <p className="text-[10px] text-white/40 -mt-1">
            Used when the project is on the Image tab. Add / remove memberships from the Image tab in the admin nav.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Format">
              <Select
                value={form.format}
                onChange={(v) => setForm({ ...form, format: v })}
                options={[
                  { value: "16:9", label: "16:9 — landscape video" },
                  { value: "4:5", label: "4:5 — portrait video" },
                ]}
              />
              <span className="block text-[10px] text-white/40 mt-1">
                {form.format === "4:5"
                  ? "Plays looped & muted at 4:5, with a blurred copy full-bleed behind it (mobile too)."
                  : "Full screen on: plays full-bleed, no blur. Full screen off: same blurred-background treatment as 4:5."}
              </span>
            </Field>
            {form.format === "16:9" && (
              <label className="flex items-start gap-2 text-xs uppercase tracking-widest text-white/60 cursor-pointer select-none pt-6">
                <input
                  type="checkbox"
                  checked={form.imageFullScreen}
                  onChange={(e) =>
                    setForm({ ...form, imageFullScreen: e.target.checked })
                  }
                  className="accent-white w-4 h-4 mt-0.5"
                />
                <span className={form.imageFullScreen ? "text-white" : "text-white/40"}>
                  Full screen
                  <span className="block normal-case tracking-normal text-[10px] text-white/40 mt-0.5">
                    Unchecked: video shown at ~75% width, blurred copy full-bleed behind it.
                  </span>
                </span>
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <CoverField
              label="Cover desktop"
              slug={form.slug}
              role="cover-desktop"
              url={form.imageCoverDesktopUrl}
              extractPoster
              onSaved={(url, meta) =>
                setForm((f) => ({
                  ...f,
                  imageCoverDesktopUrl: url,
                  // Keeps the poster (shown before this video has loaded
                  // anywhere it's used, e.g. the homepage's Image tab)
                  // pinned to this exact video's own first frame instead
                  // of silently going stale the next time the video is
                  // swapped out.
                  ...(meta?.posterUrl ? { posterUrl: meta.posterUrl } : {}),
                }))
              }
              onClear={() =>
                setForm((f) => ({ ...f, imageCoverDesktopUrl: "" }))
              }
            />
            <CoverField
              label="Cover mobile"
              slug={form.slug}
              role="cover-mobile"
              url={form.imageCoverMobileUrl}
              onSaved={(url) =>
                setForm({ ...form, imageCoverMobileUrl: url })
              }
              onClear={() =>
                setForm({ ...form, imageCoverMobileUrl: "" })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <CoverField
                label="Cover image (poster)"
                slug={form.slug}
                role="poster"
                url={form.posterUrl}
                onSaved={(url) => setForm((f) => ({ ...f, posterUrl: url }))}
                onClear={() => setForm((f) => ({ ...f, posterUrl: "" }))}
              />
              <p className="text-[10px] text-white/40 mt-1">
                Auto-filled with the cover desktop video's first frame on upload. Shown as a fallback before that video has loaded. Upload here to override it manually, or Clear to remove it.
              </p>
            </div>
          </div>

          {(form.format === "4:5" ||
            (form.format === "16:9" && !form.imageFullScreen)) && (
            <div className="grid grid-cols-2 gap-4">
              <CoverField
                label="Cover blurred background"
                slug={form.slug}
                role="cover-blur"
                url={form.imageCoverBlurUrl}
                onSaved={(url) =>
                  setForm({ ...form, imageCoverBlurUrl: url })
                }
                onClear={() =>
                  setForm({ ...form, imageCoverBlurUrl: "" })
                }
              />
              <p className="text-[10px] text-white/40 self-end pb-2">
                Optional. Shown blurred full-bleed behind the sharp video above — compress this one hard (low res, low bitrate), the blur hides the quality loss. Falls back to the cover above when empty.
              </p>
            </div>
          )}
        </section>

        {/* --- Backdrop --- */}
        <section className="space-y-3">
          <h3 className="uppercase text-xs tracking-widest text-white/60">
            Detail-view backdrop
          </h3>
          <div className="grid grid-cols-[1fr_1fr] gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/50 mb-1">
                Image (blurred behind gallery)
              </div>
              {form.bgImageUrl && (
                <div className="mb-2 w-full h-48 bg-black rounded overflow-hidden flex items-center justify-center">
                  <img
                    src={form.bgImageUrl}
                    alt=""
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}
              <UploadField
                slug={form.slug}
                role="poster"
                onUploaded={(url) => setForm({ ...form, bgImageUrl: url })}
              />
              {form.bgImageUrl && (
                <button
                  onClick={() => setForm({ ...form, bgImageUrl: "" })}
                  className="text-red-400 text-xs mt-1"
                >
                  Clear image
                </button>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/50 mb-1">
                Solid color (used when no image set)
              </div>
              <div className="flex items-center gap-3">
                <ColorPicker
                  value={form.bgColor || "#000000"}
                  onChange={(hex) => setForm({ ...form, bgColor: hex })}
                />
                <input
                  value={form.bgColor}
                  onChange={(e) =>
                    setForm({ ...form, bgColor: e.target.value })
                  }
                  placeholder="#000000"
                  className="input flex-1"
                />
                {form.bgColor && (
                  <button
                    onClick={() => setForm({ ...form, bgColor: "" })}
                    className="text-red-400 text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* --- Gallery --- */}
        <section className="space-y-3">
          <h3 className="uppercase text-xs tracking-widest text-white/60">
            Gallery — detail view ({form.gallery.length})
          </h3>
          <SortableList
            ids={form.gallery.map((it, i) => `g-${i}-${it.url}`)}
            onReorder={reorderGallery}
          >
            <ul className="space-y-2">
              {form.gallery.map((item, i) => (
                <MediaTile
                  key={`g-${i}-${item.url}`}
                  id={`g-${i}-${item.url}`}
                  item={item}
                  onChange={(next) => updateGalleryItem(i, next)}
                  onDelete={() => removeGalleryItem(i)}
                />
              ))}
            </ul>
          </SortableList>
          <div className="pt-2">
            <UploadField
              slug={form.slug}
              role="gallery"
              onUploaded={(url, meta) =>
                addGalleryItem({
                  url,
                  type: meta.type,
                  format: meta.format,
                })
              }
            />
          </div>
        </section>

        <footer className="flex items-center justify-between gap-3 pt-4 border-t border-white/10">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={del}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              Delete project
            </button>
            <label className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/60 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) =>
                  setForm({ ...form, isPublished: e.target.checked })
                }
                className="accent-white w-4 h-4"
              />
              <span
                className={form.isPublished ? "text-white" : "text-white/40"}
              >
                {form.isPublished ? "Published" : "Hidden"}
              </span>
            </label>
          </div>
        </footer>
    </>
  );

  return (
    <div className="font-mono">
      <SplitPreview
        src={`/${project.slug}?mode=${form.detailMode}`}
        messageType="tnf-preview:project"
        draft={{
          title: form.title,
          description: form.description,
          blocks: form.blocks,
        }}
        onEditChange={onInlineEdit}
        onEditRequest={handleBlockRequest}
        onSave={save}
        saving={saving}
        savedAt={savedAt}
      >
        <div className="space-y-6">{body}</div>
      </SplitPreview>

      {picking && (
        <MediaPicker
          uploadSlug={form.slug}
          onClose={() => {
            setPicking(false);
            setBlockPick(null);
          }}
          onPick={(media) => {
            if (blockPick) {
              const { index: ri, itemIndex: ii } = blockPick;
              setForm((f) => ({
                ...f,
                blocks: f.blocks.map((b, i) =>
                  i !== ri
                    ? b
                    : {
                        ...b,
                        items: b.items.map((it, j) =>
                          j === ii
                            ? { ...it, url: media.url, mediaType: media.type }
                            : it
                        ),
                      }
                ),
              }));
            }
            setPicking(false);
            setBlockPick(null);
          }}
        />
      )}

      <style jsx>{`
        :global(.input) {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 0.5rem 0.75rem;
          border-radius: 0.25rem;
          width: 100%;
          font-family: inherit;
          color: white;
          color-scheme: dark;
        }
        :global(.input:focus) {
          outline: none;
          border-color: rgba(255, 255, 255, 0.3);
        }
        :global(select.input) {
          appearance: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'><path d='M1 1l4 4 4-4' stroke='rgba(255,255,255,0.6)' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/></svg>");
          background-repeat: no-repeat;
          background-position: right 0.75rem center;
          padding-right: 2rem;
        }
        :global(select.input option) {
          background: #0a0a0a;
          color: white;
        }
      `}</style>
    </div>
  );
}

// A cover slot with thumbnail preview at the actual aspect ratio.
function CoverField({ label, slug, role, url, onSaved, onClear, extractPoster = false }) {
  const isVideo = url && (/video/.test(url) || url.match(/\.(mp4|mov|webm)$/i));
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-white/50 mb-1">
        {label}
      </div>
      {url ? (
        <div className="mb-2 w-full h-48 bg-black rounded overflow-hidden flex items-center justify-center">
          {isVideo ? (
            <video
              key={url}
              src={url}
              muted
              autoPlay
              loop
              playsInline
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <img
              src={url}
              alt=""
              className="max-w-full max-h-full object-contain"
            />
          )}
        </div>
      ) : (
        <div className="mb-2 w-full aspect-video border border-dashed border-white/20 rounded flex items-center justify-center text-white/40 text-xs">
          empty
        </div>
      )}
      <div className="flex items-center gap-3">
        <UploadField
          slug={slug}
          role={role}
          extractPoster={extractPoster}
          onUploaded={(uploadedUrl, meta) => onSaved(uploadedUrl, meta)}
        />
        {url && (
          <button
            onClick={onClear}
            className="text-red-400 text-xs hover:text-red-300"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function ModeCard({ label, hint, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left border rounded p-3 transition ${
        on ? "border-white/60 bg-white/10" : "border-white/10 hover:border-white/30"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-3 h-3 rounded-full ${on ? "bg-white" : "bg-white/20"}`}
        />
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-[10px] text-white/40 mt-1">{hint}</div>
    </button>
  );
}

function Field({ label, wide, children }) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="block text-xs uppercase tracking-widest text-white/60 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
