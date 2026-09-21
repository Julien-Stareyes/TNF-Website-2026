"use client";
import { SortableItem } from "./SortableList";

// A gallery-item tile in the admin. Shows the actual media (image or
// muted video preview) at its real aspect ratio, the current per-item
// format, and a drag handle for reordering.
export default function MediaTile({ id, item, onChange, onDelete }) {
  return (
    <SortableItem id={id}>
      {({ dragHandle }) => (
        <li className="flex gap-3 border border-white/10 p-2 rounded items-center">
          <div className="flex items-center">{dragHandle}</div>
          <div
            className="h-28 shrink-0 bg-black rounded overflow-hidden flex items-center justify-center"
            style={{ aspectRatio: aspectValue(item.format) }}
          >
            <Preview item={item} />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="text-xs text-white/70 truncate">
              {item.url.split("/").pop()}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/40">
                format
              </span>
              <select
                value={item.format ?? "16:9"}
                onChange={(e) =>
                  onChange({ ...item, format: e.target.value })
                }
                className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-xs"
              >
                {["16:9", "4:5", "9:16", "1:1", "4:3", "3:2"].map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <span className="text-[10px] uppercase tracking-widest text-white/40 ml-2">
                type
              </span>
              <span className="text-xs">{item.type}</span>
            </div>
          </div>
          <button
            onClick={onDelete}
            className="text-red-400 text-xs hover:text-red-300"
          >
            Delete
          </button>
        </li>
      )}
    </SortableItem>
  );
}

const aspectValue = (format) => {
  switch (format) {
    case "4:5": return "4 / 5";
    case "9:16": return "9 / 16";
    case "1:1": return "1 / 1";
    case "4:3": return "4 / 3";
    case "3:2": return "3 / 2";
    case "16:9":
    default: return "16 / 9";
  }
};

function Preview({ item }) {
  if (item.type === "video") {
    return (
      <video
        src={item.url}
        muted
        loop
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          try { v.currentTime = Math.min(0.5, (v.duration || 1) * 0.1); } catch {}
        }}
        className="w-full h-full object-cover"
      />
    );
  }
  return (
    <img
      src={item.url}
      alt=""
      className="w-full h-full object-cover"
      loading="lazy"
    />
  );
}
