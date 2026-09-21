// Some assets were uploaded in formats no browser can decode (TIFF and
// friends), so they render as broken images in the admin and as nothing
// on the public site. This downloads each one from R2, converts it to
// JPEG, uploads the converted file alongside, and repoints the database
// at it. The originals are left in place.
//
// Run: node --env-file=.env.local scripts/convert-unsupported-media.mjs [--dry]
import sharp from "sharp";
import postgres from "postgres";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const DRY = process.argv.includes("--dry");
const UNSUPPORTED = /\.(tiff?|psd|exr|dpx|tga|bmp)(\?|#|$)/i;

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
  if (!url.startsWith(`${PUBLIC}/`)) {
    throw new Error(
      `URL host doesn't match R2_PUBLIC_URL (${PUBLIC}) — refusing to rewrite ${url}`
    );
  }
  return url.slice(`${PUBLIC}/`.length);
};

async function convert(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const output = await sharp(input)
    .rotate()
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  const key = keyOf(url).replace(/\.[^.]+$/, ".jpg");
  if (!DRY) {
    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: output,
        ContentType: "image/jpeg",
      })
    );
  }
  return {
    url: `${PUBLIC}/${key}`,
    from: input.length,
    to: output.length,
  };
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
try {
  const rows = await sql`
    select id, slug, gallery, poster_url, bg_image_url,
           image_cover_desktop_url, image_cover_mobile_url
      from projects
  `;

  let converted = 0;
  let failed = 0;

  for (const r of rows) {
    const rewrites = new Map();
    const candidates = [
      r.poster_url,
      r.bg_image_url,
      r.image_cover_desktop_url,
      r.image_cover_mobile_url,
      ...(r.gallery ?? []).map((g) => g?.url),
    ].filter((u) => u && UNSUPPORTED.test(u));

    for (const url of [...new Set(candidates)]) {
      try {
        const out = await convert(url);
        rewrites.set(url, out.url);
        converted++;
        const mb = (n) => (n / 1024 / 1024).toFixed(1);
        console.log(
          `  ok   ${url.split("/").pop()} → ${out.url.split("/").pop()}  ${mb(
            out.from
          )}MB → ${mb(out.to)}MB`
        );
      } catch (e) {
        failed++;
        console.log(`  FAIL ${url.split("/").pop()} :: ${e.message}`);
      }
    }

    if (rewrites.size === 0 || DRY) continue;

    const swap = (u) => (u && rewrites.get(u)) || u;
    const gallery = (r.gallery ?? []).map((g) =>
      g?.url && rewrites.has(g.url)
        ? { ...g, url: rewrites.get(g.url), type: "image" }
        : g
    );

    await sql`
      update projects
         set gallery = ${sql.json(gallery)},
             poster_url = ${swap(r.poster_url)},
             bg_image_url = ${swap(r.bg_image_url)},
             image_cover_desktop_url = ${swap(r.image_cover_desktop_url)},
             image_cover_mobile_url = ${swap(r.image_cover_mobile_url)},
             updated_at = now()
       where id = ${r.id}
    `;
    console.log(`  → repointed ${rewrites.size} ref(s) on ${r.slug}`);
  }

  console.log(
    `\n${DRY ? "[dry run] " : ""}Converted ${converted}, failed ${failed}.`
  );
} finally {
  await sql.end();
}
