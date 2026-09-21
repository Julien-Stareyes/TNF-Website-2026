"use client";
import { useEffect, useState } from "react";

// Small modal for creating a project — replaces the raw prompt() dialog so
// the flow matches the rest of the admin visually.
export default function CreateProjectModal({ onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Auto-slug from the title while the user hasn't edited the slug field.
  const [slugTouched, setSlugTouched] = useState(false);
  useEffect(() => {
    if (slugTouched) return;
    setSlug(
      title
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    );
  }, [title, slugTouched]);

  const submit = async (e) => {
    e.preventDefault();
    if (!slug || !title) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Brand seeds from the title at creation, per how ProjectEditor
        // seeds it for any older project that doesn't have one yet --
        // editable independently afterward.
        body: JSON.stringify({ slug, title, brand: title }),
      });
      if (!res.ok) throw new Error(await res.text());
      const row = await res.json();
      onCreated(row);
    } catch (err) {
      setError(err.message || "Failed — slug already taken?");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-neutral-950 border border-white/10 rounded p-6 space-y-4 font-mono"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-lg">New project</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white"
          >
            ✕
          </button>
        </header>

        <label className="block">
          <span className="block text-xs uppercase tracking-widest text-white/60 mb-1">
            Title
          </span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder="Prada Magazine"
          />
        </label>

        <label className="block">
          <span className="block text-xs uppercase tracking-widest text-white/60 mb-1">
            Slug
          </span>
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "-")
                  .replace(/-+/g, "-")
              );
            }}
            className="input"
            placeholder="prada-magazine"
          />
          <span className="block text-[10px] text-white/40 mt-1">
            URL: /{slug || "…"}
          </span>
        </label>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <footer className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="border border-white/20 px-3 py-1 rounded"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !slug || !title}
            className="bg-white text-black px-3 py-1 rounded disabled:opacity-40"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </footer>

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
      </form>
    </div>
  );
}
