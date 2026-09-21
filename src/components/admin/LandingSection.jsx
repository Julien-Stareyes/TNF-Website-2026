"use client";
import { useState } from "react";
import UploadField from "./UploadField";
import MediaPicker from "./MediaPicker";
import SplitPreview from "./SplitPreview";

// Landing page editor — completely independent of projects. One video URL
// that plays as the site's opening showreel.
export default function LandingSection({ initial }) {
  const [showreelUrl, setShowreelUrl] = useState(initial?.showreelUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  const save = async (nextUrl) => {
    setSaving(true);
    await fetch("/api/settings/landing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showreelUrl: nextUrl }),
    });
    setSaving(false);
  };

  const onUploaded = (url) => {
    setShowreelUrl(url);
    save(url);
  };

  const clear = () => {
    setShowreelUrl("");
    save(null);
  };

  return (
    <SplitPreview
      src="/"
      messageType="tnf-preview:landing"
      draft={{ showreelUrl }}
      onEditRequest={(action) => {
        if (action === "pick-media") setPicking(true);
      }}
    >
      <section className="border border-white/10 rounded p-4 space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm uppercase tracking-widest text-white/60">
            Landing — showreel
          </h2>
          <p className="text-[10px] text-white/40">
            Plays on the site root (/) — independent of projects
          </p>
        </div>

        <div className="w-full bg-black rounded overflow-hidden aspect-video flex items-center justify-center">
          {showreelUrl ? (
            <video
              key={showreelUrl}
              src={showreelUrl}
              muted
              autoPlay
              loop
              playsInline
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="text-white/40 text-xs">No showreel uploaded</div>
          )}
        </div>

        <div className="space-y-2">
          <UploadField slug="landing" role="landing" onUploaded={onUploaded} />
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="w-full border border-white/20 px-3 py-1.5 rounded hover:bg-white/10 text-sm"
          >
            Pick from library
          </button>
          {showreelUrl && (
            <button
              onClick={clear}
              className="text-red-400 text-xs hover:text-red-300"
            >
              Clear showreel
            </button>
          )}
          {saving && <div className="text-white/40 text-xs">Saving…</div>}
        </div>

        {picking && (
          <MediaPicker
            filter="video"
            uploadSlug="landing"
            onClose={() => setPicking(false)}
            onPick={(item) => {
              setShowreelUrl(item.url);
              save(item.url);
              setPicking(false);
            }}
          />
        )}
      </section>
    </SplitPreview>
  );
}
