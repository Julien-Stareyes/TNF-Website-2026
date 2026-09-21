// For the 11 projects that existed in the original static projects.js,
// rewrite their DB gallery so items appear in the same order, with the same
// per-item format, as they did before the DB migration. Falls back to the
// migration-detected format if a URL doesn't match the curated list.
//
// Run:  node --env-file=.env.local scripts/restore-original-gallery.mjs
import postgres from "postgres";
import { PROJECTS as ORIGINAL } from "../src/data/projects.js";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false });

// The migrated DB slugs don't perfectly match the original ones — a couple
// were normalized differently ("Damas" → "Damascus", "printstory" →
// "print-story"). Map the original slug to whatever landed in the DB.
const SLUG_REMAP = {
  "franck-muller-damas": "franck-muller-damascus",
  "pucci-printstory": "pucci-print-story",
  "franck-muller-triple-mystery": "franck-muller-triplemystery",
};

// Given an original static asset path like
//   "/assets/01_Image/03_Franck Muller Vanguard/IP page/GIF 1.gif"
// return just the leaf filename in the migration's slugified form so we
// can look it up inside the current DB gallery.
function slugLeaf(p) {
  const leaf = p.split("/").pop();
  return leaf.replace(/[^A-Za-z0-9._-]+/g, "-");
}

async function main() {
  let touched = 0;
  for (const proj of ORIGINAL) {
    const slug = SLUG_REMAP[proj.slug] ?? proj.slug;
    const rows = await sql`select id, gallery from projects where slug = ${slug}`;
    if (rows.length === 0) {
      console.log(`  · SKIP ${slug} (not in DB)`);
      continue;
    }
    const dbGallery = Array.isArray(rows[0].gallery) ? rows[0].gallery : [];

    // Look up each original item by its filename in the current DB gallery,
    // preserving the DB's URL/type but re-using the original format.
    const restored = [];
    for (const item of proj.gallery ?? []) {
      const sourcePath = item.video ?? item.image;
      if (!sourcePath) continue;
      const wanted = slugLeaf(sourcePath);
      const match = dbGallery.find((g) => g.url.endsWith("/" + wanted));
      if (!match) {
        console.log(`  · ${slug}: no match for ${wanted}`);
        continue;
      }
      restored.push({
        url: match.url,
        type: match.type,
        format: item.format ?? match.format,
      });
    }

    // Anything left in the DB that wasn't in the curated list stays after,
    // so we don't lose extra content that migration picked up.
    const usedUrls = new Set(restored.map((r) => r.url));
    for (const g of dbGallery) {
      if (!usedUrls.has(g.url)) restored.push(g);
    }

    await sql`
      update projects
         set gallery = ${sql.json(restored)},
             updated_at = now()
       where id = ${rows[0].id}
    `;
    touched++;
    console.log(`  ✓ ${slug} — ${restored.length} items (${proj.gallery?.length ?? 0} from original)`);
  }
  console.log(`\nDone. ${touched} projects restored.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
