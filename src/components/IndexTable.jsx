"use client";
import { useMemo, useState } from "react";
import { DEFAULT_ASPECT, useAspectProbe } from "@/lib/media-aspect";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { markMuted } from "@/lib/muted-video";

// Index tab — one row per project, read left to right: year, name, what was
// made, what it was made with. The first column is left wide and mostly
// empty; that space is where the preview for the row under the pointer
// appears, so the table reads as a list and the image never displaces it.

// Sized and placed against the window, not the viewport height: the space
// it has to fit into is the empty half of the year column, which is a share
// of the width. Sizing it in vh let it grow past that column on a short,
// wide window and cover the names.
// The table's columns, shared with the overlay the preview sits in so the
// two cannot drift and the preview stays centred on the first column
// whatever the window is doing.
const COLS =
  "grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)] gap-[2vw]";
// Same padding as the table, so the overlay reproduces its content box.
const PAD = "pt-[13vh] pb-[9vh] px-[3vw]";

const PREVIEW_PCT = 80;
// A portrait project is taller at the same width, so the box needs a ceiling
// or it runs off the window.
const PREVIEW_MAX_VH = 62;

export default function IndexTable({ projects }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(null); // hovered slug

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      [p.title, p.category, p.technologies, String(p.year ?? "")]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query, projects]);

  const preview = active && filtered.find((p) => p.slug === active);

  return (
    <section className="fixed inset-0 overflow-hidden bg-white text-black">
      <SiteHeader theme="light" />

      {/* --- Mobile: the hover preview has no touch equivalent, so each row
          carries its own thumbnail and the columns stack. --- */}
      <div className="md:hidden absolute inset-0 flex flex-col pt-16">
        <ol className="flex-1 overflow-y-auto no-scrollbar px-5 pb-28 font-mono font-light">
          {filtered.map((p) => (
            <li key={p.slug} className="border-b border-black/10 last:border-0">
              <Link
                href={`/${p.slug}`}
                className="flex items-start gap-3 py-3 active:opacity-60"
              >
                <span className="w-14 h-14 shrink-0 bg-neutral-100 overflow-hidden">
                  {p.previewUrl ? (
                    p.previewType === "video" ? (
                      // The media fragment makes the browser seek to a real
                      // frame; without it the element renders blank until
                      // playback starts.
                      <video
                        ref={markMuted}
                        src={`${p.previewUrl}#t=0.1`}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.previewUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] truncate">{p.title}</span>
                  {p.category && (
                    <span className="block text-[11px] text-black/45">
                      {p.category}
                    </span>
                  )}
                  {p.technologies && (
                    <span className="block text-[11px] text-black/30">
                      {p.technologies}
                    </span>
                  )}
                </span>
                <span className="text-[11px] tabular-nums text-black/45">
                  {p.year ?? ""}
                </span>
              </Link>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="py-8 text-center text-black/40 text-[13px]">
              Nothing matches.
            </li>
          )}
        </ol>
        <div className="absolute bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-black/10 px-5 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search …"
            className="w-full bg-transparent border-b border-black/30 outline-none py-1.5 font-mono font-light text-[13px]"
          />
        </div>
      </div>

      {/* --- Desktop --- */}
      <div className={`hidden md:block absolute inset-0 ${PAD}`}>
        <div
          onMouseLeave={() => setActive(null)}
          className="h-full overflow-y-auto no-scrollbar"
        >
          <ol className="font-mono font-light text-[0.78vw] leading-[1.5]">
            {filtered.map((p) => (
              <li key={p.slug} className="border-b border-black/10">
                <Link
                  href={`/${p.slug}`}
                  onMouseEnter={() => setActive(p.slug)}
                  onFocus={() => setActive(p.slug)}
                  className={`grid ${COLS} py-[1.1vh] transition-colors ${
                    active === p.slug ? "text-accent" : "text-black"
                  }`}
                >
                  <span className="tabular-nums">{p.year ?? ""}</span>
                  <span>{p.title}</span>
                  <span className="text-black/70">{p.category}</span>
                  <span className="text-black/70">{p.technologies}</span>
                </Link>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="py-[6vh] text-center text-black/40">
                Nothing matches.
              </li>
            )}
          </ol>
        </div>

        {/* Holds the middle of the view, centred on the first column —
            which is the gap the table leaves for it. Laying the overlay out
            on the table's own columns is what keeps it centred there at any
            window size. It sits outside the scrolling list on purpose: an
            absolutely placed child of a scroll container is laid out
            against that container's content, so it would ride up the window
            as the list scrolled instead of staying put. */}
        {preview?.previewUrl && (
          <div
            // The same type as the table, so the `ch` the preview is
            // nudged by is the same width as the year it clears.
            className={`absolute inset-0 ${PAD} grid ${COLS} items-center pointer-events-none font-mono text-[0.78vw]`}
          >
            <Preview key={preview.slug} project={preview} />
          </div>
        )}
      </div>

      {/* Bottom bar — search only (desktop) */}
      <div className="hidden md:flex absolute bottom-[2.5vh] inset-x-0 px-[3vw] justify-center font-mono font-light text-[0.8vw]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search …"
          className="w-[22vw] max-w-[320px] bg-transparent border-b border-black/40 outline-none text-center py-1"
        />
      </div>
    </section>
  );
}

// Holds the same width whatever the shape and takes its height from the
// file, so a portrait project reads as portrait instead of being cropped to
// 16:9. Only where the box would then outgrow the window does the width
// come down — the alternative is a card running off the top and bottom.
// The width is a share of the column it is centred in.
function Preview({ project }) {
  const { aspect, onLoad, onLoadedMetadata, probe } = useAspectProbe(
    project.previewUrl
  );
  const a = aspect ?? DEFAULT_ASPECT;

  return (
    <div
      aria-hidden="true"
      className="justify-self-center bg-neutral-100 overflow-hidden shadow-xl"
      style={{
        width: `min(${PREVIEW_PCT}%, ${(PREVIEW_MAX_VH * a).toFixed(2)}vh)`,
        aspectRatio: String(a),
        // The gap you actually see doesn't start where the column does: it
        // starts after the year and runs on past the column into the
        // gutter. These two push the centring window over that far, so the
        // preview sits in the middle of the space rather than crowding the
        // date.
        marginLeft: "4.5ch",
        marginRight: "-2vw",
      }}
    >
      {project.previewType === "video" ? (
        <video
          ref={(el) => { markMuted(el); probe(el); }}
          src={project.previewUrl}
          autoPlay
          muted
          loop
          playsInline
          onLoadedMetadata={onLoadedMetadata}
          className="w-full h-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={probe}
          src={project.previewUrl}
          alt=""
          onLoad={onLoad}
          className="w-full h-full object-cover"
        />
      )}
    </div>
  );
}
