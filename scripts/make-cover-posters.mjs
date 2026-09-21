// A slide with no poster is a blank screen until its cover has downloaded
// — and several covers open on black, so even once playback starts there
// is nothing to see for a second or two. This pulls a representative still
// out of each cover and stores it, so the slide has something up the
// moment it is on screen.
//
// Run: node --env-file=.env.local scripts/make-cover-posters.mjs [--dry] [--only=slug]
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const run = promisify(execFile);
const DRY = process.argv.includes("--dry");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

// Wide enough to stand in for the video without being a download of its
// own. It is only on screen for the moment before the cover takes over.
const POSTER_W = 720;

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

const keyOf = (url) => {
  if (!url.startsWith(`${PUBLIC}/`))
    throw new Error(
      `URL host doesn't match R2_PUBLIC_URL (${PUBLIC}) — refusing to rewrite ${url}`
    );
  return url.slice(`${PUBLIC}/`.length);
};

// The very first frame, not a representative one. A livelier still from
// the middle of the clip only makes the moment the video takes over
// obvious — the point is that you never notice there was an image.
async function poster(url, tmp, name) {
  const out = path.join(tmp, `${name}.jpg`);
  await fs.rm(out, { force: true });
  await run("ffmpeg", [
    "-v", "error", "-y", "-i", url,
    "-vf", `scale=${POSTER_W}:-2`,
    "-frames:v", "1", "-q:v", "3", out,
  ]);
  return fs.readFile(out);
}

const kb = (n) => (n / 1024).toFixed(0).padStart(4);

async function main() {
  const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
  const rows = await sql`
    select p.id, p.slug,
           p.image_cover_desktop_url as d,
           p.image_cover_mobile_url as m
    from project_tabs t join projects p on p.id = t.project_id
    where t.tab = 'image' and t.published = true and p.is_published = true
      and coalesce(p.image_cover_mobile_url, '') <> ''
    order by t.position`;

  const targets = ONLY ? rows.filter((r) => r.slug === ONLY) : rows;
  console.log(`${targets.length} project(s)\n`);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tnf-poster-"));

  for (const row of targets) {
    const made = {};
    for (const [field, src, column] of [
      ["desktop", row.d, "poster_url"],
      ["mobile", row.m, "poster_mobile_url"],
    ]) {
      if (!src) continue;
      let jpg;
      try {
        jpg = await poster(src, tmp, field);
      } catch (e) {
        console.log(`  !! ${row.slug} ${field}: ${e.message.split("\n")[0]}`);
        continue;
      }
      // The content decides the name. These are served immutable for a
      // year, so writing a regenerated poster back to the same key would
      // leave every browser and edge that already has one showing the old
      // picture until well after anybody remembers why.
      const stamp = createHash("sha1").update(jpg).digest("hex").slice(0, 8);
      const key = keyOf(src).replace(/(\.[^.]+)$/, `_poster_${stamp}.jpg`);
      const url = `${PUBLIC}/${key}`;
      if (!DRY) {
        await r2.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: jpg,
            ContentType: "image/jpeg",
            CacheControl: "public, max-age=31536000, immutable",
          })
        );
        await sql.unsafe(
          `update projects set ${column} = $1, updated_at = now() where id = $2`,
          [url, row.id]
        );
      }
      made[field] = jpg.length;
    }
    console.log(
      `${kb(made.desktop ?? 0)} KB desktop | ${kb(made.mobile ?? 0)} KB mobile  ${row.slug}`
    );
  }

  await fs.rm(tmp, { recursive: true, force: true });
  await sql.end();

  if (!DRY)
    console.log(
      `
The /image page is cached. Redeploy, or save any project in the admin, to have it pick these up before its hour is out.`
    );
}

main();
