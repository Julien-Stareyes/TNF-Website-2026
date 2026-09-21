// The Image tab's mobile covers were uploaded at mastering bitrates — up
// to 72 Mbps for a 1080x1920 loop, which is 134 MB for fifteen seconds —
// and most of them carry their index at the end of the file, so a phone
// has to finish downloading before playback can even start.
//
// This re-encodes each one for delivery and repoints the database at the
// result. Originals are left untouched under their own keys, so undoing
// this is a matter of putting the old URLs back.
//
// Run: node --env-file=.env.local scripts/reencode-mobile-covers.mjs [--dry] [--only=slug]
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

// Constant quality rather than a fixed bitrate: a still, dark shot gets
// the bits a busy one doesn't need. 26 measured at 0.99995 SSIM against
// the original on the hardest clip in the set. Long covers still land
// large at that setting, so they can be given a number of their own.
const CRF = process.argv.find((a) => a.startsWith("--crf="))?.slice(6) ?? "26";

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

// Refuse to guess. If R2_PUBLIC_URL doesn't match the URLs in the
// database, a silent `replace` miss turns the whole URL into the object
// key and writes a doubled-up URL back — so fail loudly instead.
const keyOf = (url) => {
  if (!url.startsWith(`${PUBLIC}/`))
    throw new Error(
      `URL host doesn't match R2_PUBLIC_URL (${PUBLIC}) — refusing to rewrite ${url}`
    );
  return url.slice(`${PUBLIC}/`.length);
};

const mb = (n) => (n / 1048576).toFixed(1).padStart(6);

async function main() {
  const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
  const rows = await sql`
    select id, slug, image_cover_mobile_url as url
    from projects
    where is_published = true and coalesce(image_cover_mobile_url, '') <> ''
    order by position`;

  const targets = ONLY ? rows.filter((r) => r.slug === ONLY) : rows;
  console.log(`${targets.length} mobile cover(s) to re-encode, CRF ${CRF}\n`);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tnf-cover-"));
  let before = 0;
  let after = 0;

  for (const row of targets) {
    const src = path.join(tmp, "in.mp4");
    const out = path.join(tmp, "out.mp4");
    await fs.rm(out, { force: true });

    // Always encode from the original, never from a previous pass — the
    // stored URL is whatever ran last, and stacking generations throws
    // away quality for nothing.
    const source = row.url.replace(/_web\.mp4$/, ".mp4");
    const res = await fetch(source);
    if (!res.ok) {
      console.log(`  !! ${row.slug}: fetch ${res.status}`);
      continue;
    }
    const input = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(src, input);

    await run("ffmpeg", [
      "-v", "error", "-y", "-i", src,
      "-c:v", "libx264", "-profile:v", "high", "-preset", "slow",
      "-crf", CRF, "-pix_fmt", "yuv420p",
      // The covers play muted and looped, so the audio track is dead
      // weight on every one of them.
      "-an",
      // Put the index at the front so playback can start on the first
      // chunk instead of the last.
      "-movflags", "+faststart",
      out,
    ]);

    const output = await fs.readFile(out);
    before += input.length;
    after += output.length;

    // A new key beside the original, never over it.
    const key = keyOf(source).replace(/(\.[^.]+)$/, "_web.mp4");
    const url = `${PUBLIC}/${key}`;

    if (!DRY) {
      await r2.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: output,
          ContentType: "video/mp4",
          CacheControl: "public, max-age=31536000, immutable",
        })
      );
      await sql`update projects set image_cover_mobile_url = ${url},
        updated_at = now() where id = ${row.id}`;
    }

    console.log(
      `${mb(input.length)} -> ${mb(output.length)} MB  ` +
        `(${(input.length / output.length).toFixed(1)}x)  ${row.slug}`
    );
  }

  console.log(
    `\ntotal ${mb(before)} -> ${mb(after)} MB` +
      (before ? `  (${(before / after).toFixed(1)}x smaller)` : "") +
      (DRY ? "  [dry run, nothing written]" : "")
  );

  await fs.rm(tmp, { recursive: true, force: true });
  await sql.end();

  // Writing straight to the database goes around the admin, which is what
  // normally calls revalidatePath. /image is served from the ISR cache, so
  // until it is rebuilt the page can still hand out the old URLs — and a
  // snapshot taken mid-run will carry a mix of both.
  if (!DRY)
    console.log(
      `
The /image page is cached. Redeploy, or save any project in the admin, to have it pick these up before its hour is out.`
    );
}

main();
