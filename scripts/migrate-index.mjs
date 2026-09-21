// One-shot importer: walks public/assets/03_Index/<PROJECT>/, uploads every
// file (recursively) to R2 under projects/<slug>/{uuid}.<ext>, creates the
// project row if missing, and adds it to the `index` tab.
//
// Run with:   node --env-file=.env.local scripts/migrate-index.mjs
//
// Safe to re-run — projects are upserted by slug; assets already in R2 are
// re-uploaded (idempotent overwrite for cover paths; gallery items append).
import { readdir, stat, readFile } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import postgres from "postgres";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const HERE = fileURLToPath(new URL("./", import.meta.url));
const ROOT = join(HERE, "..");
const SRC = join(ROOT, "public", "assets", "03_Index");

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false });
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET;
const PUBLIC = process.env.R2_PUBLIC_URL;
const publicUrl = (key) => `${PUBLIC}/${key}`;

const MIME = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
  ".pdf": "application/pdf",
};

// "2026_PRADA MAGAZINE" -> { year: 2026, slug: "prada-magazine", title: "Prada Magazine" }
function parseFolder(name) {
  const m = /^(\d{4})_(.+)$/.exec(name);
  const raw = m ? m[2] : name;
  const year = m ? Number(m[1]) : null;
  const title = raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
  const slug = raw
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return { year, slug, title };
}

async function walkFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(p)));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

async function objectExists(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function upload(key, filePath, contentType) {
  const body = await readFile(filePath);
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

function fileType(ext) {
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  if (ext === "gif") return "gif";
  return "image";
}

async function upsertProject({ slug, title, year }) {
  const rows = await sql`
    insert into projects (slug, title, format, theme, gallery, year)
    values (${slug}, ${title}, '16:9', 'dark', '[]'::jsonb, ${year})
    on conflict (slug) do update
      set title = excluded.title,
          year  = coalesce(projects.year, excluded.year)
    returning id, gallery
  `;
  return rows[0];
}

async function addToIndexTab(projectId, position) {
  await sql`
    insert into project_tabs (project_id, tab, position, published)
    values (${projectId}, 'index', ${position}, true)
    on conflict (project_id, tab) do update set position = excluded.position
  `;
}

async function setGallery(projectId, gallery) {
  await sql`
    update projects
       set gallery = ${sql.json(gallery)},
           updated_at = now()
     where id = ${projectId}
  `;
}

async function main() {
  const entries = (await readdir(SRC, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  console.log(`Found ${entries.length} project folders.`);

  let position = 0;
  for (const name of entries) {
    const dir = join(SRC, name);
    const files = await walkFiles(dir);
    const { slug, title, year } = parseFolder(name);

    console.log(`\n=== ${name} → ${slug} (${year || "?"}, ${files.length} files) ===`);
    const { id: projectId } = await upsertProject({ slug, title, year });

    const gallery = [];
    for (const file of files) {
      const ext = extname(file).slice(1).toLowerCase();
      const contentType = MIME[`.${ext}`] || "application/octet-stream";
      // Deterministic key based on relative path hash — safe re-runs.
      const rel = relative(dir, file).replace(/\\/g, "/");
      const key = `projects/${slug}/${slugifyPath(rel)}`;

      if (await objectExists(key)) {
        console.log(`  · exists    ${rel}`);
      } else {
        process.stdout.write(`  ↑ upload  ${rel} ... `);
        try {
          await upload(key, file, contentType);
          console.log("ok");
        } catch (err) {
          console.log(`FAIL (${err.message})`);
          continue;
        }
      }
      gallery.push({ url: publicUrl(key), type: fileType(ext) });
    }

    await setGallery(projectId, gallery);
    await addToIndexTab(projectId, position++);
    console.log(`  → project stored (${gallery.length} gallery items)`);
  }

  console.log("\nDone.");
  await sql.end();
}

// Filesystem-safe key transform: keeps original filename but lowercases and
// replaces spaces / weird chars.
function slugifyPath(rel) {
  return rel
    .split("/")
    .map((seg) => seg.replace(/[^A-Za-z0-9._-]+/g, "-"))
    .join("/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
