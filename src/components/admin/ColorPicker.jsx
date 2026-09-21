"use client";
import { useEffect, useRef, useState } from "react";

// Small custom colour picker matching the admin's mono/dark aesthetic —
// browsers' native <input type="color"> can't be styled at all, so we
// render an HSV pad + hue slider + hex input in a popover.
export default function ColorPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const safe = value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-14 h-10 border border-white/10 rounded overflow-hidden cursor-pointer"
        style={{ background: safe }}
        aria-label="Pick colour"
      />
      {open && (
        <div className="absolute z-50 top-full mt-2 left-0 w-64 bg-neutral-900 border border-white/15 rounded shadow-xl p-3 space-y-3">
          <SvPad hex={safe} onChange={onChange} />
          <HueSlider hex={safe} onChange={onChange} />
          <HexAndRgb hex={safe} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// 2D saturation × value pad tinted with the current hue.
function SvPad({ hex, onChange }) {
  const padRef = useRef(null);
  const [h] = hexToHsv(hex);
  const [, s, v] = hexToHsv(hex);

  const update = (clientX, clientY) => {
    const el = padRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    onChange(hsvToHex(h, x, 1 - y));
  };

  const onDown = (e) => {
    update(e.clientX, e.clientY);
    const onMove = (ev) => update(ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const hueBg = hsvToHex(h, 1, 1);
  return (
    <div
      ref={padRef}
      onPointerDown={onDown}
      className="relative w-full h-32 rounded overflow-hidden cursor-crosshair select-none"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueBg})`,
      }}
    >
      <div
        className="absolute w-3 h-3 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          left: `${s * 100}%`,
          top: `${(1 - v) * 100}%`,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}

function HueSlider({ hex, onChange }) {
  const trackRef = useRef(null);
  const [h, s, v] = hexToHsv(hex);

  const update = (clientX) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onChange(hsvToHex(x * 360, s || 1, v || 1));
  };

  const onDown = (e) => {
    update(e.clientX);
    const onMove = (ev) => update(ev.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={onDown}
      className="relative w-full h-3 rounded cursor-pointer select-none"
      style={{
        background:
          "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
      }}
    >
      <div
        className="absolute top-1/2 w-3 h-3 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          left: `${(h / 360) * 100}%`,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}

function HexAndRgb({ hex, onChange }) {
  const [r, g, b] = hexToRgb(hex);
  const [text, setText] = useState(hex);
  useEffect(() => setText(hex), [hex]);

  const commit = (raw) => {
    let v = raw.trim();
    if (!v.startsWith("#")) v = `#${v}`;
    if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toLowerCase());
    else setText(hex);
  };

  const setChannel = (idx, val) => {
    const n = Math.max(0, Math.min(255, Number(val) || 0));
    const next = [r, g, b];
    next[idx] = n;
    onChange(rgbToHex(next[0], next[1], next[2]));
  };

  return (
    <div className="space-y-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(text);
          }
        }}
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm uppercase focus:outline-none focus:border-white/30"
        spellCheck={false}
      />
      <div className="grid grid-cols-3 gap-2">
        {["R", "G", "B"].map((label, i) => (
          <label key={label} className="block">
            <input
              type="number"
              min={0}
              max={255}
              value={[r, g, b][i]}
              onChange={(e) => setChannel(i, e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-white/30"
            />
            <span className="block text-center text-[10px] text-white/40 mt-0.5">
              {label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colour math — HSV/HEX/RGB conversions. Kept inline so this component has
// zero runtime dependencies.
// ---------------------------------------------------------------------------
function hexToRgb(hex) {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex || "");
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  const to2 = (n) => n.toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function hexToHsv(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return [h, s, v];
}

function hsvToHex(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex(
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  );
}
