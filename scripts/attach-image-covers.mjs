// One-shot: walk every project in the DB, look at its gallery for objects
// whose R2 key matches the cover naming convention (CoverDesktop_*,
// CoverMobile_*, DesktopCover*, MobileCover*), and wire them into the
// project's Image-tab membership. Also publishes the project into the
// Image tab so it shows up on /image without further clicks.
//
// Run with:   node --env-file=.env.local scripts/attach-image-covers.mjs
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false });

// Include the `CoverDestop` typo used in a handful of source folders.
const DESKTOP_RE = /(cover(?:desktop|destop)|desktopcover)/i;
const MOBILE_RE = /(covermobile|mobilecover)/i;

async function main() {
  const projects = await sql`select id, slug, title, gallery from projects order by slug`;
  console.log(`Scanning ${projects.length} projects for cover assets…`);

  let attached = 0;
  let position = 0;
  for (const p of projects) {
    const gallery = p.gallery ?? [];
    const desktop = gallery.find((g) => DESKTOP_RE.test(g.url));
    const mobile = gallery.find((g) => MOBILE_RE.test(g.url));

    if (!desktop) continue;

    // The cover items shouldn't also appear in the detail gallery — trim
    // them out so the detail row shows only the curated shots.
    const trimmedGallery = gallery.filter(
      (g) => g !== desktop && g !== mobile
    );
    await sql`
      update projects
         set gallery = ${sql.json(trimmedGallery)},
             updated_at = now()
       where id = ${p.id}
    `;

    await sql`
      insert into project_tabs
        (project_id, tab, position, published,
         image_cover_desktop_url, image_cover_mobile_url)
      values
        (${p.id}, 'image', ${position}, true,
         ${desktop.url}, ${mobile?.url ?? null})
      on conflict (project_id, tab) do update
        set image_cover_desktop_url = excluded.image_cover_desktop_url,
            image_cover_mobile_url  = excluded.image_cover_mobile_url,
            published               = true
    `;
    attached++;
    position++;
    console.log(
      `  · ${p.slug}  → desktop ✓  mobile ${mobile ? "✓" : "—"}  (gallery ${gallery.length} → ${trimmedGallery.length})`
    );
  }

  console.log(`\nDone. ${attached} projects attached to Image tab.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
