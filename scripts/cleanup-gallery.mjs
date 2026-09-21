// Post-migration cleanup:
//   1. Files under any `/BG/` subfolder aren't gallery items — they're the
//      wallpaper behind the layout. Move the first one into `poster_url`
//      and drop them from the gallery.
//   2. Each remaining gallery item gets a per-item `format` field derived
//      from the source file's aspect ratio (via ffprobe on the local copy).
//
// Run with:   node --env-file=.env.local scripts/cleanup-gallery.mjs
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const HERE = fileURLToPath(new URL("./", import.meta.url));
const SRC_ROOT = join(HERE, "..", "public", "assets", "03_Index");

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false });

const ffprobe = (file) =>
  new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0",
      file,
    ]);
    let out = "";
    p.stdout.on("data", (b) => (out += b.toString()));
    p.on("close", () => {
      const m = /^(\d+),(\d+)/.exec(out.trim());
      if (!m) return resolve(null);
      resolve({ w: Number(m[1]), h: Number(m[2]) });
    });
    p.on("error", () => resolve(null));
  });

// Standard aspect buckets. 16:9 = ~1.78, 4:5 = 0.80, 9:16 = 0.5625.
function classifyFormat(w, h) {
  const r = w / h;
  const cands = [
    { name: "16:9", ratio: 16 / 9 },
    { name: "4:5", ratio: 4 / 5 },
    { name: "9:16", ratio: 9 / 16 },
    { name: "1:1", ratio: 1 },
    { name: "4:3", ratio: 4 / 3 },
    { name: "3:2", ratio: 3 / 2 },
  ];
  cands.sort((a, b) => Math.abs(a.ratio - r) - Math.abs(b.ratio - r));
  return cands[0].name;
}

// Turn a public R2 URL back into a local filesystem path under
// public/assets/03_Index/. Both are keyed on the same source layout so the
// mapping is a simple base-swap.
async function pickLocalFileForUrl(url, slugFolderMap) {
  // URL: https://…/projects/<slug>/<rel path>
  const m = /\/projects\/([^/]+)\/(.+)$/.exec(url);
  if (!m) return null;
  const [, slug, encodedRel] = m;
  const folder = slugFolderMap.get(slug);
  if (!folder) return null;
  // We slugified paths at upload — un-slugifying is not one-to-one, so we
  // walk the source folder and match by leaf filename.
  const target = encodedRel.split("/").pop();
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        const hit = await walk(p);
        if (hit) return hit;
      } else if (e.isFile()) {
        // Slugified leaf must match.
        const slugLeaf = e.name.replace(/[^A-Za-z0-9._-]+/g, "-");
        if (slugLeaf === target) return p;
      }
    }
    return null;
  };
  const root = join(SRC_ROOT, folder);
  try {
    await stat(root);
  } catch {
    return null;
  }
  return await walk(root);
}

async function buildSlugFolderMap() {
  const entries = await readdir(SRC_ROOT, { withFileTypes: true });
  const map = new Map();
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = /^(\d{4})_(.+)$/.exec(e.name);
    const raw = m ? m[2] : e.name;
    const slug = raw
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    map.set(slug, e.name);
  }
  return map;
}

async function main() {
  const slugFolderMap = await buildSlugFolderMap();
  const projects = await sql`select id, slug, gallery, poster_url from projects`;
  console.log(`Cleaning ${projects.length} projects…`);

  let cleaned = 0;
  for (const p of projects) {
    const gallery = Array.isArray(p.gallery) ? p.gallery : [];
    if (gallery.length === 0) continue;

    // Split BG items out.
    const bg = gallery.filter((g) => /\/BG\//i.test(g.url));
    let rest = gallery.filter((g) => !/\/BG\//i.test(g.url));

    // Determine format per item.
    for (const item of rest) {
      const local = await pickLocalFileForUrl(item.url, slugFolderMap);
      if (!local) {
        item.format = item.format ?? "16:9";
        continue;
      }
      const dims = await ffprobe(local);
      item.format = dims ? classifyFormat(dims.w, dims.h) : "16:9";
    }

    const posterUrl = p.poster_url ?? bg[0]?.url ?? null;

    await sql`
      update projects
         set gallery = ${sql.json(rest)},
             poster_url = ${posterUrl},
             updated_at = now()
       where id = ${p.id}
    `;
    cleaned++;
    process.stdout.write(
      `\r  · ${cleaned}/${projects.length} — ${p.slug} (${rest.length} items, poster ${posterUrl ? "✓" : "—"})   `
    );
  }
  console.log(`\nDone. ${cleaned} projects cleaned.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
