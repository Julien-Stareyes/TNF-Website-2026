"use client";
import { useEffect, useMemo, useState } from "react";
import ProjectEditor from "./ProjectEditor";
import LandingSection from "./LandingSection";
import InfoSection from "./InfoSection";
import TabStateSwitch from "./TabStateSwitch";
import SplitPreview from "./SplitPreview";
import CreateProjectModal from "./CreateProjectModal";
import { SortableList, SortableItem } from "./SortableList";

const NAV = [
  { key: "all", label: "All projects" },
  { key: "landing", label: "Landing" },
  { key: "image", label: "Image" },
  { key: "immersive", label: "Immersive" },
  { key: "index", label: "Index" },
  { key: "info", label: "Info" },
];

export default function AdminDashboard({
  initialProjects,
  initialLanding,
  initialInfo,
  initialImmersive,
  initialTabStates,
}) {
  const [tabStates, setTabStates] = useState(initialTabStates ?? {});
  const [projects, setProjects] = useState(initialProjects);
  const [creating, setCreating] = useState(false);

  // Where you are lives in the URL, so a reload (or a shared link, or the
  // back button) lands on the same tab and the same project instead of
  // bouncing you to All projects.
  const readUrl = () => {
    if (typeof window === "undefined") return { nav: "all", slug: null };
    const q = new URLSearchParams(window.location.search);
    const tab = q.get("tab");
    return {
      nav: NAV.some((n) => n.key === tab) ? tab : "all",
      slug: q.get("project"),
    };
  };

  const [nav, setNav] = useState(() => readUrl().nav);
  const [editingSlug, setEditingSlug] = useState(() => readUrl().slug);

  // Written with replaceState rather than the router: this is view state,
  // not navigation, and pushing it would re-run the server component and
  // refetch everything on each tab click.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    nav === "all" ? q.delete("tab") : q.set("tab", nav);
    editingSlug ? q.set("project", editingSlug) : q.delete("project");
    const qs = q.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`
    );
  }, [nav, editingSlug]);

  // Back/forward still move between views.
  useEffect(() => {
    const onPop = () => {
      const next = readUrl();
      setNav(next.nav);
      setEditingSlug(next.slug);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const refresh = async () => {
    const res = await fetch("/api/projects", { cache: "no-store" });
    if (res.ok) setProjects(await res.json());
  };

  const signOut = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "signout" }),
    });
    window.location.reload();
  };

  // Identified by slug, not id — it's what the URL carries and it stays
  // readable when someone shares the link.
  const editing = projects.find((p) => p.slug === editingSlug);
  const openEditor = (id) =>
    setEditingSlug(projects.find((p) => p.id === id)?.slug ?? null);
  const closeEditor = () => setEditingSlug(null);

  // A slug in the URL that matches nothing (renamed, deleted) shouldn't
  // leave the panel stuck on an empty editor.
  useEffect(() => {
    if (editingSlug && projects.length && !editing) setEditingSlug(null);
  }, [editingSlug, editing, projects.length]);

  return (
    <div className="max-w-[1800px] mx-auto space-y-6 font-mono">
      <header className="flex items-center justify-between">
        <h1 className="text-lg tracking-widest">T.N.F Admin</h1>
        <button
          onClick={signOut}
          className="border border-white/20 px-3 py-1 rounded hover:bg-white/10 text-sm"
        >
          Sign out
        </button>
      </header>

      {/* Section status lives beside its own tab, so parking Immersive
          while it's unfinished is done where that work happens. */}
      {!editing && ["image", "immersive", "index", "info"].includes(nav) && (
        <div className="flex justify-end -mb-2">
          <TabStateSwitch
            tab={nav}
            states={tabStates}
            onChange={setTabStates}
          />
        </div>
      )}

      <nav className="flex flex-wrap items-center gap-1 border-b border-white/10 pb-3">
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => {
              setNav(n.key);
              closeEditor();
            }}
            className={`px-3 py-1.5 text-sm rounded-t border-b-2 -mb-[calc(0.75rem+1px)] transition ${
              nav === n.key && !editing
                ? "border-white text-white"
                : "border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            {n.label}
          </button>
        ))}
        {editing && (
          <>
            <span className="text-white/25 px-1">/</span>
            <span className="px-3 py-1.5 text-sm border-b-2 border-white -mb-[calc(0.75rem+1px)]">
              {editing.title}
            </span>
            <button
              onClick={closeEditor}
              className="ml-2 text-[10px] uppercase tracking-widest text-white/40 hover:text-white border border-white/10 rounded px-2 py-1"
            >
              ← Back
            </button>
          </>
        )}
      </nav>

      {/* A project editor takes over the whole surface — it's a working
          view with its own live preview, not a dialog over the list. */}
      {editing ? (
        <ProjectEditor
          key={editing.id}
          project={editing}
          onClose={closeEditor}
          onChange={(saved) => {
            if (saved?.slug) setEditingSlug(saved.slug);
            refresh();
          }}
        />
      ) : (
        <>
          {nav === "all" && (
            <AllProjectsTab
              projects={projects}
              onEdit={openEditor}
              onCreate={() => setCreating(true)}
              onRefresh={refresh}
            />
          )}
          {nav === "landing" && <LandingSection initial={initialLanding} />}
          {nav === "image" && (
            <CuratedTab
              tab="image"
              projects={projects}
              setProjects={setProjects}
              onEdit={openEditor}
              onRefresh={refresh}
            />
          )}
          {nav === "immersive" && (
            <CuratedTab
              tab="immersive"
              projects={projects}
              setProjects={setProjects}
              onEdit={openEditor}
              onRefresh={refresh}
              settings={initialImmersive}
            />
          )}
          {nav === "index" && (
            <IndexTab projects={projects} onEdit={openEditor} />
          )}
          {nav === "info" && <InfoSection initial={initialInfo} />}
        </>
      )}

      {creating && (
        <CreateProjectModal
          onClose={() => setCreating(false)}
          onCreated={(row) => {
            setCreating(false);
            refresh().then(() => setEditingSlug(row.slug));
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// All projects — CRUD list. Doesn't drive any public tab order; it's the
// place to create / delete / edit project rows.
// ---------------------------------------------------------------------------
const PROJECT_FILTERS = [
  { key: "all", label: "All" },
  { key: "image", label: "Image" },
  { key: "immersive", label: "Immersive" },
  { key: "unassigned", label: "Unassigned" },
  { key: "hidden", label: "Hidden" },
];

function AllProjectsTab({ projects, onEdit, onCreate }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...projects]
      .filter((p) => {
        if (filter === "image" && p.detailMode !== "image") return false;
        if (filter === "immersive" && p.detailMode !== "immersive")
          return false;
        if (filter === "hidden" && p.isPublished) return false;
        if (filter === "unassigned" && (p.tabs?.image || p.tabs?.immersive))
          return false;
        if (!needle) return true;
        return `${p.title} ${p.slug} ${p.category ?? ""} ${p.year ?? ""}`
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [projects, filter, query]);

  // Counts sit on the filter chips so the split is legible at a glance.
  const counts = useMemo(
    () => ({
      all: projects.length,
      image: projects.filter((p) => p.detailMode === "image").length,
      immersive: projects.filter((p) => p.detailMode === "immersive").length,
      unassigned: projects.filter(
        (p) => !p.tabs?.image && !p.tabs?.immersive
      ).length,
      hidden: projects.filter((p) => !p.isPublished).length,
    }),
    [projects]
  );

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm uppercase tracking-widest text-white/60">
          All projects ({shown.length}
          {shown.length !== projects.length ? ` of ${projects.length}` : ""})
        </h2>
        <button
          onClick={onCreate}
          className="shrink-0 border border-white/20 px-3 py-1 rounded hover:bg-white/10 text-sm"
        >
          + New project
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {PROJECT_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2 py-1 rounded text-[11px] uppercase tracking-widest border transition ${
                filter === f.key
                  ? "bg-white text-black border-white"
                  : "border-white/15 text-white/50 hover:text-white"
              }`}
            >
              {f.label}
              <span
                className={
                  filter === f.key ? "text-black/50 ml-1" : "text-white/30 ml-1"
                }
              >
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, slug, category…"
          className="flex-1 min-w-[180px] bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-white/30"
        />
      </div>

      <ul className="grid grid-cols-1 xl:grid-cols-2 gap-2">
        {shown.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => onEdit(p.id)}
              className="w-full text-left border border-white/10 rounded p-2 flex items-center gap-3 hover:border-white/30 transition"
            >
              <Thumb project={p} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate flex-1">{p.title}</span>
                  <ModePill mode={p.detailMode} />
                </div>
                <div className="text-[11px] text-white/40 truncate">
                  {p.slug} · {p.year ?? "—"}
                </div>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {!p.isPublished && <Pill tone="danger">hidden</Pill>}
                  {p.tabs?.image && <Pill>in image</Pill>}
                  {p.tabs?.immersive && <Pill>in immersive</Pill>}
                </div>
              </div>
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="text-white/40 border border-white/10 rounded px-3 py-2 text-sm">
            {projects.length === 0
              ? "No projects — hit + New project."
              : "Nothing matches this filter."}
          </li>
        )}
      </ul>
    </section>
  );
}

// Which detail layout a project renders with — the distinction the
// filter above is built around.
function ModePill({ mode }) {
  const immersive = mode === "immersive";
  return (
    <span
      className={`shrink-0 px-1.5 py-0.5 text-[10px] uppercase tracking-widest border rounded ${
        immersive
          ? "border-[#c67a2e]/60 text-[#e5a260]"
          : "border-white/20 text-white/50"
      }`}
      title={
        immersive
          ? "Detail renders as a vertical case study"
          : "Detail renders as the horizontal carousel"
      }
    >
      {immersive ? "immersive" : "image"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Curated tab (Image or Immersive) — drag reorder, add/remove membership.
// ---------------------------------------------------------------------------
function CuratedTab({
  tab,
  projects,
  setProjects,
  onEdit,
  onRefresh,
  settings,
}) {
  // Every membership/order mutation lands in the DB immediately, so the
  // preview just re-fetches — bumping this counter is the trigger.
  const [previewNonce, setPreviewNonce] = useState(0);
  const bumpPreview = () => setPreviewNonce((n) => n + 1);

  // Immersive carries one editable string (the intro copy bottom-left),
  // typed straight into the preview like the Info page's fields.
  const editsCopy = tab === "immersive";
  const [copy, setCopy] = useState(settings ?? {});
  const [savingCopy, setSavingCopy] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const saveCopy = async () => {
    setSavingCopy(true);
    await fetch(`/api/settings/${tab}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(copy),
    });
    setSavingCopy(false);
    setSavedAt(new Date().toLocaleTimeString());
  };

  const members = useMemo(() => {
    return projects
      .filter((p) => p.tabs?.[tab])
      .sort(
        (a, b) => (a.tabs[tab].position ?? 0) - (b.tabs[tab].position ?? 0)
      );
  }, [projects, tab]);

  const [picking, setPicking] = useState(false);
  const candidates = useMemo(
    () =>
      projects
        .filter((p) => !p.tabs?.[tab])
        .sort((a, b) => a.title.localeCompare(b.title)),
    [projects, tab]
  );

  const reorder = async (newIds) => {
    // Optimistic — rewrite membership positions locally.
    setProjects((prev) =>
      prev.map((p) => {
        const idx = newIds.indexOf(p.id);
        if (idx < 0 || !p.tabs?.[tab]) return p;
        return { ...p, tabs: { ...p.tabs, [tab]: { ...p.tabs[tab], position: idx } } };
      })
    );
    await fetch("/api/projects/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab, ids: newIds }),
    });
    onRefresh();
    bumpPreview();
  };

  const addToTab = async (project) => {
    await fetch(`/api/projects/${project.id}/tabs/${tab}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        position: members.length,
        published: true,
      }),
    });
    setPicking(false);
    onRefresh();
    bumpPreview();
  };

  const removeFromTab = async (project) => {
    await fetch(`/api/projects/${project.id}/tabs/${tab}`, {
      method: "DELETE",
    });
    onRefresh();
    bumpPreview();
  };

  return (
    <SplitPreview
      src={`/${tab}`}
      reloadKey={previewNonce}
      messageType={editsCopy ? `tnf-preview:${tab}` : undefined}
      draft={editsCopy ? copy : undefined}
      onEditChange={
        editsCopy ? (field, v) => setCopy((c) => ({ ...c, [field]: v })) : undefined
      }
      onSave={editsCopy ? saveCopy : undefined}
      saving={savingCopy}
      savedAt={savedAt}
    >
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm uppercase tracking-widest text-white/60">
            {tab === "image" ? "Image" : "Immersive"} ({members.length})
          </h2>
          <p className="text-[10px] text-white/40 mt-1">
            Drag to reorder — this is the public order on /{tab}
          </p>
        </div>
        <button
          onClick={() => setPicking(true)}
          className="shrink-0 border border-white/20 px-3 py-1 rounded hover:bg-white/10 text-sm"
        >
          + Add
        </button>
      </div>

      <SortableList
        ids={members.map((p) => p.id)}
        onReorder={reorder}
      >
        <ul className="space-y-1">
          {members.map((p, i) => (
            <SortableItem key={p.id} id={p.id}>
              {({ dragHandle }) => (
                <li className="flex items-center gap-2 border border-white/10 px-2 py-2 rounded">
                  {dragHandle}
                  <span className="text-white/40 w-5 shrink-0 text-xs tabular-nums">
                    {i + 1}.
                  </span>
                  <Thumb project={p} small />
                  <button
                    onClick={() => onEdit(p.id)}
                    className="flex-1 min-w-0 text-left group"
                  >
                    <span className="block truncate text-sm group-hover:underline">
                      {p.title}
                    </span>
                    <span className="block truncate text-[11px] text-white/40">
                      {p.slug}
                    </span>
                  </button>
                  {!p.isPublished && <Pill tone="danger">hidden</Pill>}
                  <button
                    onClick={() => removeFromTab(p)}
                    className="shrink-0 text-red-400 hover:text-red-300 text-sm px-1"
                    title={`Remove from ${tab}`}
                  >
                    ✕
                  </button>
                </li>
              )}
            </SortableItem>
          ))}
          {members.length === 0 && (
            <li className="text-white/40 border border-white/10 px-3 py-2 rounded">
              Empty — hit + Add project.
            </li>
          )}
        </ul>
      </SortableList>

      {picking && (
        <ProjectPicker
          candidates={candidates}
          onPick={addToTab}
          onClose={() => setPicking(false)}
          tab={tab}
        />
      )}
    </section>
    </SplitPreview>
  );
}

// ---------------------------------------------------------------------------
// Index — auto-sorted by completion date. Read-only ordering (no drag);
// clicking a row edits the project.
// ---------------------------------------------------------------------------
function IndexTab({ projects, onEdit }) {
  const sorted = useMemo(() => {
    return [...projects]
      .filter((p) => p.isPublished)
      .sort((a, b) => {
        const aKey = a.completedAt || (a.year ? `${a.year}-01-01` : "0000-00-00");
        const bKey = b.completedAt || (b.year ? `${b.year}-01-01` : "0000-00-00");
        if (aKey !== bKey) return bKey.localeCompare(aKey);
        return a.title.localeCompare(b.title);
      });
  }, [projects]);

  return (
    <SplitPreview src="/archive">
    <section className="space-y-3">
      <div>
        <h2 className="text-sm uppercase tracking-widest text-white/60">
          Index ({sorted.length})
        </h2>
        <p className="text-[10px] text-white/40 mt-1">
          Auto-sorted by completion date — edit a project to change its date
        </p>
      </div>
      <ul className="space-y-1">
        {sorted.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => onEdit(p.id)}
              className="w-full flex items-center gap-2 border border-white/10 px-2 py-2 rounded hover:border-white/30 text-left"
            >
              <Thumb project={p} small />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm">{p.title}</span>
                <span className="block truncate text-[11px] text-white/40">
                  {p.category ?? "—"}
                </span>
              </span>
              <span className="shrink-0 text-white/50 text-[11px] tabular-nums text-right">
                {p.completedAt ?? (p.year ? `${p.year}-01-01` : "—")}
              </span>
            </button>
          </li>
        ))}
        {sorted.length === 0 && (
          <li className="text-white/40 border border-white/10 px-3 py-2 rounded">
            No published projects.
          </li>
        )}
      </ul>
    </section>
    </SplitPreview>
  );
}


// ---------------------------------------------------------------------------
// Small shared UI bits.
// ---------------------------------------------------------------------------
function Thumb({ project, small }) {
  const url =
    project.imageCoverDesktopUrl ??
    project.posterUrl ??
    project.bgImageUrl ??
    project.gallery?.[0]?.url ??
    null;
  const isVideo = url && /\.(mp4|mov|webm)$/i.test(url);
  const size = small ? "w-10 h-10" : "w-16 h-16";
  return (
    <div
      className={`${size} shrink-0 bg-neutral-900 border border-white/10 rounded overflow-hidden flex items-center justify-center`}
    >
      {url ? (
        isVideo ? (
          <video
            src={`${url}#t=0.1`}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="w-full h-full object-cover" />
        )
      ) : (
        <span className="text-white/20 text-[10px]">no cover</span>
      )}
    </div>
  );
}

function Pill({ children, tone }) {
  const cls =
    tone === "danger"
      ? "border-red-400/40 text-red-300"
      : "border-white/20 text-white/60";
  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] uppercase tracking-widest border rounded ${cls}`}
    >
      {children}
    </span>
  );
}

function ProjectPicker({ candidates, onPick, onClose, tab }) {
  const [q, setQ] = useState("");
  const filtered = candidates.filter((p) =>
    (p.title + " " + p.slug).toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-neutral-950 border border-white/10 rounded p-4 space-y-3 font-mono max-h-[80vh] flex flex-col"
      >
        <header className="flex items-center justify-between">
          <h3 className="text-sm uppercase tracking-widest text-white/60">
            Add project to {tab}
          </h3>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            ✕
          </button>
        </header>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-white/30"
        />
        <ul className="space-y-1 overflow-y-auto">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onPick(p)}
                className="w-full text-left flex items-center gap-3 border border-white/10 px-3 py-2 rounded hover:border-white/30"
              >
                <Thumb project={p} small />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm">{p.title}</span>
                  <span className="block truncate text-[11px] text-white/40">
                    {p.slug}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="text-white/40 text-sm px-3 py-2">
              Nothing to add.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
