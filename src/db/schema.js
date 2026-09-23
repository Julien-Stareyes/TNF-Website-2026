import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Projects — one row per unique piece of work. There's a single master list
// (ordered by `position`); every public tab (Image, Immersive, Index) is a
// filter over this list. Media URLs point at Cloudflare R2.
// ---------------------------------------------------------------------------
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  // The project's brand/client name, shown by the cursor-following label
  // on the Image carousel (ScrollScramble.jsx) -- kept separate from
  // `title` (which stays the project's own name everywhere else, e.g.
  // the right-edge index) since the two read differently: "Vanguard"
  // (title) vs "Franck Muller" (brand). New projects seed it from the
  // title in the admin (ProjectEditor.jsx) and an operator can retype it
  // from there.
  brand: text("brand"),
  description: text("description"),
  format: text("format").notNull().default("16:9"), // '16:9' | '4:5' | '9:16'
  // Only meaningful when format is '16:9'. true (default) = current
  // behaviour: the cover video covers the full screen, no blur, no double
  // video. false = same blurred full-bleed background + centered sharp
  // card treatment already used for '4:5', at a wider card size.
  imageFullScreen: boolean("image_full_screen").notNull().default(true),
  theme: text("theme").default("dark"), // 'dark' | 'light' | null (auto)
  year: integer("year"),
  // Exact completion date — Index sorts by this. `year` still lives on the
  // project because that's what actually renders in the Index table.
  completedAt: date("completed_at"),
  // The Index table reads these two as its last columns: `category` is what
  // was made ("Branding, Website") and `technologies` is what it was made
  // with ("Sanity, Next.js"). Both are free text, rendered as written.
  category: text("category"),
  technologies: text("technologies"),
  // Still frames shown while a cover downloads, so a slide is never a
  // blank screen. Split the same way the covers are, because the two are
  // framed differently and a poster has to match the video it stands in
  // for or the picture jumps when the video fades up.
  posterUrl: text("poster_url"),
  posterMobileUrl: text("poster_mobile_url"),
  bgImageUrl: text("bg_image_url"),
  bgColor: text("bg_color"),
  gallery: jsonb("gallery").notNull().default([]),
  // 'image' renders the horizontal card carousel; 'immersive' renders a
  // vertical case study assembled from `blocks`.
  detailMode: text("detail_mode").notNull().default("image"),
  // Ordered rows for the immersive detail layout. One shape covers every
  // arrangement in the reference designs — a row is a 12-column grid with
  // its own width, background and padding, holding media and/or text:
  //   { id, width, background, padY, gap, items: [
  //       { id, kind:'media', url, mediaType, aspect, span, align },
  //       { id, kind:'text', content, textAlign, span, align } ] }
  blocks: jsonb("blocks").notNull().default([]),
  // Global visibility flag — flips the project off everywhere (every tab)
  // without touching memberships or media.
  isPublished: boolean("is_published").notNull().default(true),
  // Kept for stable ordering in the All-Projects admin view (nothing else
  // uses it — Image/Immersive have their own curated position on
  // project_tabs, Index sorts by year).
  position: integer("position").notNull().default(0),
  // Manual override for the Index page's order. null (the default) means
  // "not manually placed" -- listIndexTab() then falls back to sorting by
  // completion date, same as before this existed. Dragging in the admin's
  // Index tab assigns 0..N-1 to every visible project at once (see
  // reorderIndex()), so from that point on the whole list is manually
  // ordered until someone reorders again.
  indexPosition: integer("index_position"),
  // Unused by the current app (tab membership is driven by `project_tabs`
  // below instead) — kept here only so drizzle doesn't see them as
  // orphaned and offer to drop them, which would delete real data.
  showInImage: boolean("show_in_image").notNull().default(false),
  showInImmersive: boolean("show_in_immersive").notNull().default(false),
  // Image-tab list-view previews live on the project — they follow the
  // project regardless of which tab surfaces it.
  imageCoverDesktopUrl: text("image_cover_desktop_url"),
  imageCoverMobileUrl: text("image_cover_mobile_url"),
  // Separate, heavily-compressed clip for the blurred full-bleed
  // background shown behind the sharp card on 4:5 (and non-full-screen
  // 16:9) slides. Optional — falls back to the main cover above when
  // empty, so nothing breaks for a project that hasn't uploaded one yet.
  // One file for both mobile and desktop: it's blurred and small enough
  // that a separate mobile variant isn't worth the extra upload step.
  imageCoverBlurUrl: text("image_cover_blur_url"),
  // HEVC variants of the same covers — also unused by the current app,
  // kept for the same reason as showInImage/showInImmersive above.
  imageCoverDesktopHevcUrl: text("image_cover_desktop_hevc_url"),
  imageCoverMobileHevcUrl: text("image_cover_mobile_hevc_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Legacy per-tab membership table. Kept around so old migrations still
// apply cleanly; the app no longer reads or writes it. New tab flags live
// on `projects` above.
// ---------------------------------------------------------------------------
export const projectTabs = pgTable(
  "project_tabs",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tab: text("tab").notNull(),
    position: integer("position").notNull().default(0),
    published: boolean("published").notNull().default(true),
    imageCoverDesktopUrl: text("image_cover_desktop_url"),
    imageCoverMobileUrl: text("image_cover_mobile_url"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.tab] }),
  })
);

// ---------------------------------------------------------------------------
// Site-wide singletons — small key/value store for things that aren't
// tied to a project (Landing showreel, contact page copy, etc.).
// ---------------------------------------------------------------------------
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
