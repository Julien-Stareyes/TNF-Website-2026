import "server-only";
import { and, asc, eq, desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { projects, projectTabs } = schema;

// Every project row — used by the All-Projects admin view. Membership
// (which tabs the project appears on) is attached as `tabs: { image, immersive }`.
export async function listAll() {
  const all = await db
    .select()
    .from(projects)
    .orderBy(asc(projects.position), asc(projects.slug));
  const memberships = await db.select().from(projectTabs);
  const byId = new Map(all.map((p) => [p.id, { ...p, tabs: {} }]));
  for (const m of memberships) {
    const p = byId.get(m.projectId);
    if (p) p.tabs[m.tab] = m;
  }
  return Array.from(byId.values());
}

// Curated tabs (Image, Immersive) — filter by membership + membership order.
async function listCuratedTab(tab) {
  const rows = await db
    .select({ project: projects, membership: projectTabs })
    .from(projectTabs)
    .innerJoin(projects, eq(projectTabs.projectId, projects.id))
    .where(
      and(
        eq(projectTabs.tab, tab),
        eq(projectTabs.published, true),
        eq(projects.isPublished, true)
      )
    )
    .orderBy(asc(projectTabs.position));
  return rows.map(({ project, membership }) => ({
    ...project,
    tabPosition: membership.position,
    tab,
  }));
}

// Index — every published project, newest completion first, then title.
// `completed_at` is precise (day-level); a null falls back to year via
// COALESCE so the ordering degrades gracefully for legacy rows.
async function listIndexTab() {
  return db
    .select()
    .from(projects)
    .where(eq(projects.isPublished, true))
    .orderBy(
      sql`coalesce(${projects.completedAt}, make_date(coalesce(${projects.year}, 2026), 1, 1)) desc`,
      asc(projects.title)
    );
}

export async function listForTab(tab) {
  if (tab === "index") return listIndexTab();
  if (tab === "image" || tab === "immersive") return listCuratedTab(tab);
  return [];
}

export async function getBySlug(slug, { includeHidden = false } = {}) {
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
  if (!p) return null;
  if (!includeHidden && !p.isPublished) return null;
  return p;
}

export async function createProject(data) {
  const [{ max }] = await db
    .select({ max: sql`coalesce(max(${projects.position}), -1)` })
    .from(projects);
  const [row] = await db
    .insert(projects)
    .values({ ...data, position: Number(max) + 1 })
    .returning();
  return row;
}

export async function updateProject(id, patch) {
  const [row] = await db
    .update(projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();
  return row;
}

export async function deleteProject(id) {
  await db.delete(projects).where(eq(projects.id, id));
}

// Per-tab membership helpers — used by Image / Immersive add/remove.
export async function upsertTabMembership(projectId, tab, values) {
  await db
    .insert(projectTabs)
    .values({ projectId, tab, ...values })
    .onConflictDoUpdate({
      target: [projectTabs.projectId, projectTabs.tab],
      set: values,
    });
}

export async function removeTabMembership(projectId, tab) {
  await db
    .delete(projectTabs)
    .where(and(eq(projectTabs.projectId, projectId), eq(projectTabs.tab, tab)));
}

// Rewrite ordering for one curated tab (Image or Immersive).
export async function reorderTab(tab, orderedProjectIds) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedProjectIds.length; i++) {
      await tx
        .update(projectTabs)
        .set({ position: i })
        .where(
          and(
            eq(projectTabs.projectId, orderedProjectIds[i]),
            eq(projectTabs.tab, tab)
          )
        );
    }
  });
}
