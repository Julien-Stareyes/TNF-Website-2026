"use client";
import { useState } from "react";
import UploadField from "./UploadField";
import SplitPreview from "./SplitPreview";
import { SortableList, SortableItem } from "./SortableList";

// Info-page editor. The public /info route reads the "about" paragraph,
// the 5 (or however many) services bullets and the client-logo strip
// from the "info" settings blob -- everything here maps straight to
// those three things. See lib/settings.js's INFO_DEFAULTS for the
// shape and fallback copy, and InfoPage.jsx / LogoMarquee.jsx for how
// it's consumed.
export default function InfoSection({ initial }) {
  const [form, setForm] = useState({
    aboutBody: initial.aboutBody ?? "",
    servicesItems: initial.servicesItems ?? [],
    logos: initial.logos ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const save = async () => {
    setSaving(true);
    await fetch("/api/settings/info", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString());
  };

  const setService = (idx, value) =>
    setForm((f) => ({
      ...f,
      servicesItems: f.servicesItems.map((s, i) => (i === idx ? value : s)),
    }));

  const addService = () =>
    setForm((f) => ({
      ...f,
      servicesItems: [...f.servicesItems, "New bullet point"],
    }));

  const removeService = (idx) =>
    setForm((f) => ({
      ...f,
      servicesItems: f.servicesItems.filter((_, i) => i !== idx),
    }));

  const reorderServices = (newIds) =>
    setForm((f) => {
      // Ids are index-based (`s-<i>`, see below) so they stay stable while
      // typing -- rebuild the lookup from the current array each time.
      const byId = new Map(f.servicesItems.map((s, i) => [`s-${i}`, s]));
      const next = newIds.map((id) => byId.get(id)).filter((s) => s !== undefined);
      return { ...f, servicesItems: next };
    });

  const addLogo = (url) =>
    setForm((f) => ({ ...f, logos: [...f.logos, { url }] }));

  const removeLogo = (idx) =>
    setForm((f) => ({ ...f, logos: f.logos.filter((_, i) => i !== idx) }));

  return (
    <SplitPreview
      src="/info"
      messageType="tnf-preview:info"
      draft={form}
      onSave={save}
      saving={saving}
      savedAt={savedAt}
    >
      <section className="space-y-6">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-sm uppercase tracking-widest text-white/60">
              Info page
            </h2>
            <p className="text-[10px] text-white/40 mt-1">
              Rendered at /info · save applies to all viewers immediately
            </p>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && (
              <span className="text-[10px] text-white/40">Saved {savedAt}</span>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="bg-white text-black px-3 py-1 rounded disabled:opacity-40 text-sm"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {/* About */}
        <Field label="About (right column, above Services)">
          <textarea
            value={form.aboutBody}
            onChange={(e) => setForm({ ...form, aboutBody: e.target.value })}
            rows={4}
            className="input"
          />
        </Field>

        {/* Services bullets */}
        <div className="border border-white/10 rounded p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="uppercase text-xs tracking-widest text-white/60">
              Services bullets ({form.servicesItems.length})
            </h3>
            <button
              onClick={addService}
              className="border border-white/20 px-3 py-1 rounded hover:bg-white/10 text-xs"
            >
              + Add
            </button>
          </div>

          <SortableList
            ids={form.servicesItems.map((s, i) => `s-${i}`)}
            onReorder={reorderServices}
          >
            <ul className="space-y-2">
              {form.servicesItems.map((item, i) => (
                // Id is index-based, not content-based: including `item`
                // here meant every keystroke changed the key, so React
                // unmounted/remounted the input and dropped focus after
                // each character.
                <SortableItem key={`s-${i}`} id={`s-${i}`}>
                  {({ dragHandle }) => (
                    <li className="flex items-center gap-2">
                      {dragHandle}
                      <input
                        value={item}
                        onChange={(e) => setService(i, e.target.value)}
                        className="input flex-1"
                        placeholder="Bullet point"
                      />
                      <button
                        onClick={() => removeService(i)}
                        className="text-red-400 hover:text-red-300 px-2"
                        title="Remove bullet"
                      >
                        ✕
                      </button>
                    </li>
                  )}
                </SortableItem>
              ))}
              {form.servicesItems.length === 0 && (
                <li className="text-white/40 text-xs">
                  No bullets — hit + Add.
                </li>
              )}
            </ul>
          </SortableList>
        </div>

        {/* Client logos */}
        <div className="border border-white/10 rounded p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="uppercase text-xs tracking-widest text-white/60">
                Client logos ({form.logos.length})
              </h3>
              <p className="text-[10px] text-white/40 mt-1">
                Looping strip at the bottom of /info. Empty = the six
                built-in marks.
              </p>
            </div>
            <UploadField slug="site" role="logo" viaProxy onUploaded={addLogo} />
          </div>

          {form.logos.length > 0 && (
            <ul className="grid grid-cols-4 md:grid-cols-6 gap-2">
              {form.logos.map((logo, i) => (
                <li
                  key={`${logo.url}-${i}`}
                  className="relative group border border-white/10 rounded bg-white/5 aspect-video flex items-center justify-center p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo.url}
                    alt=""
                    className="max-w-full max-h-full object-contain"
                  />
                  <button
                    onClick={() => removeLogo(i)}
                    title="Remove logo"
                    className="absolute -top-2 -right-2 bg-black border border-white/20 rounded-full w-5 h-5 flex items-center justify-center text-white/70 hover:text-red-400 hover:border-red-400 text-xs opacity-0 group-hover:opacity-100 transition"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
        `}</style>
      </section>
    </SplitPreview>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-widest text-white/60 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
