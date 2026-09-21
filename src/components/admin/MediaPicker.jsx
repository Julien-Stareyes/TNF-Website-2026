"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import UploadField from "./UploadField";

// Media library, browsed the way the assets are actually organised in
// R2: projects first, then that project's files. Searching cuts across
// the hierarchy and shows flat results instead. `uploadSlug` enables
// uploading a new file straight into that project's folder.
export default function MediaPicker({
  onPick,
  onClose,
  filter = "all",
  uploadSlug,
}) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState(filter);
  const [openProject, setOpenProject] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/media", { cache: "no-store" }).then(async (r) => {
      if (cancelled) return;
      setItems(r.ok ? await r.json() : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const byType = useMemo(
    () => (items ?? []).filter((it) => type === "all" || it.type === type),
    [items, type]
  );

  // Group into projects, preserving the order the API returned them in.
  const projects = useMemo(() => {
    const map = new Map();
    for (const it of byType) {
      if (!map.has(it.project))
        map.set(it.project, { slug: it.project, title: it.title, items: [] });
      map.get(it.project).items.push(it);
    }
    return [...map.values()].sort((a, b) =>
      (a.title ?? a.slug).localeCompare(b.title ?? b.slug)
    );
  }, [byType]);

  const needle = q.trim().toLowerCase();
  const searching = needle.length > 0;

  const searchResults = useMemo(() => {
    if (!searching) return [];
    return byType.filter((it) =>
      `${it.title ?? ""} ${it.project ?? ""} ${it.role ?? ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [byType, needle, searching]);

  const current = openProject
    ? projects.find((p) => p.slug === openProject)
    : null;

  const visibleProjects = searching
    ? projects.filter((p) =>
        `${p.title ?? ""} ${p.slug}`.toLowerCase().includes(needle)
      )
    : projects;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 font-mono text-white"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl h-[80vh] bg-neutral-950 border border-white/10 rounded p-4 flex flex-col gap-3"
      >
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setOpenProject(null)}
              disabled={!current}
              className={`text-sm uppercase tracking-widest ${
                current
                  ? "text-white/50 hover:text-white"
                  : "text-white/60 cursor-default"
              }`}
            >
              Library
            </button>
            {current && (
              <>
                <span className="text-white/25">/</span>
                <span className="text-sm truncate">
                  {current.title ?? current.slug}
                </span>
                <span className="text-[11px] text-white/35 shrink-0">
                  ({current.items.length})
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {uploadSlug && (
              <UploadField
                slug={current?.slug ?? uploadSlug}
                role="gallery"
                onUploaded={(url, meta) =>
                  onPick({
                    url,
                    type: meta.type,
                    project: current?.slug ?? uploadSlug,
                    role: "gallery",
                  })
                }
              />
            )}
            <button onClick={onClose} className="text-white/60 hover:text-white">
              ✕
            </button>
          </div>
        </header>

        <div className="flex items-center gap-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              current ? "Search in this project…" : "Search projects and files…"
            }
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-white/30"
          />
          <div className="flex text-xs border border-white/10 rounded overflow-hidden shrink-0">
            {["all", "video", "image"].map((k) => (
              <button
                key={k}
                onClick={() => setType(k)}
                className={`px-3 py-2 uppercase tracking-widest ${
                  type === k
                    ? "bg-white text-black"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {items === null ? (
          <Empty>Loading library…</Empty>
        ) : current ? (
          <FileGrid
            items={
              searching
                ? current.items.filter((it) =>
                    `${it.title ?? ""} ${it.role ?? ""}`
                      .toLowerCase()
                      .includes(needle)
                  )
                : current.items
            }
            onPick={onPick}
          />
        ) : searching ? (
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pr-1">
            {visibleProjects.length > 0 && (
              <Section title={`Projects (${visibleProjects.length})`}>
                <ProjectGrid
                  projects={visibleProjects}
                  onOpen={(slug) => {
                    setOpenProject(slug);
                    setQ("");
                  }}
                />
              </Section>
            )}
            {searchResults.length > 0 && (
              <Section title={`Files (${searchResults.length})`}>
                <Tiles items={searchResults} onPick={onPick} />
              </Section>
            )}
            {visibleProjects.length === 0 && searchResults.length === 0 && (
              <Empty>Nothing matches.</Empty>
            )}
          </div>
        ) : projects.length === 0 ? (
          <Empty>No media yet.</Empty>
        ) : (
          <div className="flex-1 overflow-y-auto no-scrollbar pr-1">
            <ProjectGrid projects={projects} onOpen={setOpenProject} />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest text-white/35">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return (
    <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
      {children}
    </div>
  );
}

// A project reads as a folder: a cover thumbnail, its name, and how many
// files are inside.
function ProjectGrid({ projects, onOpen }) {
  return (
    <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {projects.map((p) => {
        // Always four cells, padded with blanks, so every card is the
        // same height however many files the project has.
        const cells = [...p.items.slice(0, 4), null, null, null, null].slice(
          0,
          4
        );
        return (
          <li key={p.slug}>
            <button
              onClick={() => onOpen(p.slug)}
              className="w-full text-left border border-white/10 rounded overflow-hidden hover:border-white/40 transition"
            >
              <div className="aspect-video bg-neutral-900 grid grid-cols-2 grid-rows-2 gap-px">
                {cells.map((it, i) =>
                  it ? (
                    <span key={it.url} className="relative overflow-hidden bg-black">
                      <Thumb item={it} className="absolute inset-0 w-full h-full" />
                    </span>
                  ) : (
                    <span key={`blank-${i}`} className="bg-black/60" />
                  )
                )}
              </div>
              <div className="p-2 space-y-0.5">
                <div className="text-[11px] text-white/80 truncate">
                  {p.title ?? p.slug}
                </div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest">
                  {p.items.length} file{p.items.length === 1 ? "" : "s"}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FileGrid({ items, onPick }) {
  if (items.length === 0) return <Empty>Nothing matches.</Empty>;
  return (
    <div className="flex-1 overflow-y-auto no-scrollbar pr-1">
      <Tiles items={items} onPick={onPick} />
    </div>
  );
}

function Tiles({ items, onPick }) {
  return (
    <ul className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {items.map((it) => (
        <li key={it.url}>
          <button
            onClick={() => onPick(it)}
            className="w-full text-left border border-white/10 rounded overflow-hidden hover:border-white/40 transition"
          >
            <div className="relative aspect-video bg-black overflow-hidden">
              <Thumb
                item={it}
                hoverPlay
                className="absolute inset-0 w-full h-full"
              />
            </div>
            <div className="p-2 space-y-0.5">
              <div className="text-[11px] text-white/80 truncate">
                {it.title || it.project}
              </div>
              <div className="text-[10px] text-white/40 truncate uppercase tracking-widest">
                {it.role} · {it.type}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Thumb({ item, className = "", hoverPlay }) {
  // Some assets are formats no browser can decode (TIFF, PSD, EXR). Say
  // so instead of rendering a broken-image glyph — these also won't show
  // on the public site, which is worth surfacing here.
  if (isUnsupportedUrl(item.url)) {
    const ext = (item.url.split(".").pop() ?? "").split(/[?#]/)[0];
    return (
      <span
        className={`${className} grid place-content-center gap-0.5 bg-neutral-800 text-center`}
        title={`${ext.toUpperCase()} can't be displayed in a browser — convert it to JPEG or WebP`}
      >
        <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400/80">
          {ext}
        </span>
        <span className="font-mono text-[8px] uppercase tracking-widest text-white/30">
          no preview
        </span>
      </span>
    );
  }

  // Trust the file extension over the stored type — some gallery rows
  // carry a type that doesn't match the asset, which rendered an <img>
  // pointed at an .mp4 and showed a broken-image icon.
  if (isVideoUrl(item.url) || (item.type === "video" && !isImageUrl(item.url))) {
    return (
      <video
        src={`${item.url}#t=0.1`}
        muted
        playsInline
        loop
        preload="metadata"
        onMouseEnter={
          hoverPlay ? (e) => e.currentTarget.play().catch(() => {}) : undefined
        }
        onMouseLeave={
          hoverPlay
            ? (e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0.1;
              }
            : undefined
        }
        className={`${className} object-cover`}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.url}
      alt=""
      loading="lazy"
      className={`${className} object-cover`}
      onError={(e) => {
        // Leave a quiet placeholder rather than a broken-image glyph.
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}

const isVideoUrl = (u) => /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(u ?? "");
const isImageUrl = (u) =>
  /\.(jpe?g|png|webp|gif|avif|heic)(\?|#|$)/i.test(u ?? "");
const isUnsupportedUrl = (u) =>
  /\.(tiff?|psd|exr|dpx|tga|bmp|ai|eps)(\?|#|$)/i.test(u ?? "");
