"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Real device viewports, so the preview shows the page at the aspect
// ratio it will actually be read at rather than an endless column.
const VIEWPORTS = [
  { key: "desktop", label: "Desktop", width: null, height: null },
  { key: "tablet", label: "Tablet", width: 834, height: 1194 }, // iPad Air
  { key: "mobile", label: "Mobile", width: 440, height: 956 }, // iPhone 17 Pro Max
];

// Editor on the left, a live iframe of the public page on the right.
// `draft` is pushed into the iframe over postMessage on every keystroke,
// so the operator sees unsaved edits immediately; Save (owned by the
// child form) is what actually writes to the DB.
export default function SplitPreview({
  src,
  messageType,
  draft,
  reloadKey,
  onEditChange,
  onEditRequest,
  onSave,
  saving,
  savedAt,
  children,
}) {
  const frameRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [viewport, setViewport] = useState("desktop");
  const editable = Boolean(onEditChange || onEditRequest);
  const [editing, setEditing] = useState(editable);
  // When the page supports click-to-edit, the form panel starts collapsed
  // — the preview is the primary surface and deserves the width.
  const [formOpen, setFormOpen] = useState(!editable);

  // Keep the latest handlers in a ref so the message listener below can
  // stay mounted for the life of the component without going stale.
  const handlers = useRef({ onEditChange, onEditRequest });
  handlers.current = { onEditChange, onEditRequest };

  // The iframe announces itself once its React tree has mounted; only
  // then is it safe to start pushing drafts or enabling edit mode.
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data;
      if (!d?.type) return;
      if (d.type === "tnf-preview:ready") setReady(true);
      else if (d.type === "tnf-edit:change")
        handlers.current.onEditChange?.(d.field, d.value);
      else if (d.type === "tnf-edit:request")
        handlers.current.onEditRequest?.(d.action, d.field, d.payload);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // A new src means a fresh document, so the handshake has to happen
  // again before drafts or edit mode can be pushed into it.
  useEffect(() => {
    setReady(false);
  }, [src]);

  // Flip the iframe in and out of visual-editing mode.
  useEffect(() => {
    if (!ready || !editable) return;
    frameRef.current?.contentWindow?.postMessage(
      { type: editing ? "tnf-edit:enable" : "tnf-edit:disable" },
      "*"
    );
  }, [ready, editing, editable]);

  // Push the draft on every change (and once the frame first signals
  // ready, so a frame that mounts late still gets the current state).
  useEffect(() => {
    if (!ready || !messageType) return;
    frameRef.current?.contentWindow?.postMessage(
      { type: messageType, payload: draft },
      "*"
    );
  }, [draft, ready, messageType]);

  const reload = useCallback(() => {
    setReady(false);
    const frame = frameRef.current;
    if (frame) frame.src = frame.src;
  }, []);

  // Tabs whose edits commit straight to the DB (curated ordering,
  // membership) have nothing to stream as a draft — they bump
  // `reloadKey` instead and we re-fetch the page.
  const firstReload = useRef(true);
  useEffect(() => {
    if (reloadKey === undefined) return;
    if (firstReload.current) {
      firstReload.current = false;
      return;
    }
    reload();
  }, [reloadKey, reload]);

  const active = VIEWPORTS.find((v) => v.key === viewport);

  // Scale a device-sized frame down until it fits the available stage.
  const stageRef = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !active.width) {
      setScale(1);
      return;
    }
    const fit = () => {
      const pad = 32;
      const w = (stage.clientWidth - pad) / active.width;
      const h = (stage.clientHeight - pad) / active.height;
      setScale(Math.min(1, w, h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [active]);

  return (
    <div
      className={`grid grid-cols-1 gap-6 items-start ${
        formOpen
          ? "xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"
          : "xl:grid-cols-[0_minmax(0,1fr)]"
      }`}
    >
      <div className={`min-w-0 ${formOpen ? "" : "hidden xl:block xl:invisible xl:h-0 xl:overflow-hidden"}`}>
        {children}
      </div>

      <div className="hidden xl:flex flex-col gap-2 sticky top-6">
        {/* Three zones: what's on screen · how it's shown · what to do
            with it. Each group is labelled so the controls read as
            belonging somewhere rather than a row of buttons. */}
        <div className="flex items-center justify-between gap-4 border border-white/10 rounded-lg px-2 py-1.5 bg-white/[0.03]">
          <Group label="Panel">
            <Chip onClick={() => setFormOpen((v) => !v)} on={formOpen}>
              Form
            </Chip>
            {editable && (
              <Chip
                onClick={() => setEditing((v) => !v)}
                on={editing}
                title="Click-to-edit directly on the preview"
              >
                Edit
              </Chip>
            )}
          </Group>

          <Group label="Viewport">
            {VIEWPORTS.map((v) => (
              <Chip
                key={v.key}
                onClick={() => setViewport(v.key)}
                on={viewport === v.key}
                title={
                  v.width ? `${v.width} × ${v.height}` : "Fills the panel"
                }
              >
                {v.label}
              </Chip>
            ))}
          </Group>

          <Group label="Page" align="end">
            <Chip onClick={reload} title="Reload from the server">
              Reload
            </Chip>
            {onSave && (
              <button
                onClick={onSave}
                disabled={saving}
                className="h-6 px-3 rounded bg-white text-black font-mono text-[10px] uppercase tracking-[0.14em] disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </Group>
        </div>

        <div className="flex items-center justify-between text-[10px] text-white/35 px-1">
          <span className="uppercase tracking-widest">
            {editable && editing ? "Click anything to edit" : "Live preview"}
            {/* Only pages that stream drafts do a handshake; the rest are
                plain iframes with nothing to connect to. */}
            {(messageType || editable) && !ready ? " · connecting…" : ""}
          </span>
          {savedAt && <span>Saved {savedAt}</span>}
        </div>

        <div
          ref={stageRef}
          className="border border-white/10 rounded overflow-hidden bg-neutral-900 h-[calc(100vh-9rem)] flex items-center justify-center p-4"
        >
          {/* A device frame renders at its true pixel size and is scaled
              down to fit the panel, so the page is laid out at the real
              viewport rather than a squeezed column. */}
          <div
            style={
              active.width
                ? {
                    width: active.width * scale,
                    height: active.height * scale,
                    flex: "none",
                  }
                : { width: "100%", height: "100%" }
            }
          >
            <iframe
              ref={frameRef}
              src={src}
              title="Live preview"
              className="border-0 bg-white"
              style={
                active.width
                  ? {
                      width: active.width,
                      height: active.height,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                      borderRadius: 8,
                    }
                  : { width: "100%", height: "100%" }
              }
            />
          </div>
        </div>
        {active.width && (
          <p className="text-[10px] text-white/30 text-center">
            {active.width} × {active.height}
            {scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// A labelled cluster of related controls.
function Group({ label, children, align }) {
  return (
    <div
      className={`flex items-center gap-2 min-w-0 ${
        align === "end" ? "justify-end" : ""
      }`}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/25 select-none shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-0.5">{children}</div>
    </div>
  );
}

function Chip({ children, onClick, on, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`h-6 px-2.5 rounded font-mono text-[10px] uppercase tracking-[0.14em] transition ${
        on
          ? "bg-white text-black"
          : "text-white/50 hover:text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
