"use client";
import { useState } from "react";

const STATES = [
  { key: "live", label: "Live", hint: "Visible and working" },
  { key: "soon", label: "Coming soon", hint: "Link stays, page holds" },
  { key: "hidden", label: "Hidden", hint: "Link removed from the nav" },
];

// Park a section that isn't finished without pulling its code. Sits in
// the header of the tab it governs, so the state is where the work is.
export default function TabStateSwitch({ tab, states, onChange }) {
  const [saving, setSaving] = useState(false);
  const current = states?.[tab] ?? "live";

  const set = async (next) => {
    if (next === current) return;
    const merged = { ...states, [tab]: next };
    onChange?.(merged);
    setSaving(true);
    await fetch("/api/settings/tabs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged),
    });
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-2">
      {current !== "live" && (
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#e5a260]">
          Offline — visitors see a holding screen, you see the real page
        </span>
      )}
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">
        Status
      </span>
      <div className="flex items-center gap-0.5">
        {STATES.map((s) => (
          <button
            key={s.key}
            onClick={() => set(s.key)}
            title={s.hint}
            className={`h-6 px-2.5 rounded font-mono text-[10px] uppercase tracking-[0.14em] transition ${
              current === s.key
                ? s.key === "live"
                  ? "bg-white text-black"
                  : "bg-[#c67a2e] text-white"
                : "text-white/45 hover:text-white hover:bg-white/10"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {saving && <span className="text-[10px] text-white/30">saving…</span>}
    </div>
  );
}
