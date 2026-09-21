// Uploads the local landing showreel to R2 and writes its public URL into
// the site settings so the landing page starts serving from R2 immediately.
//
// Run:  node --env-file=.env.local scripts/upload-showreel.mjs
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import postgres from "postgres";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const LOCAL = "public/assets/0_Landing/2026 SHOWREEL V2.mp4";
const KEY = "site/landing/showreel-2026.mp4";

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

const info = await stat(LOCAL);
console.log(`Uploading ${LOCAL} (${(info.size / 1024 / 1024).toFixed(1)} MB)…`);
const body = await readFile(LOCAL);
await r2.send(
  new PutObjectCommand({
    Bucket: BUCKET,
    Key: KEY,
    Body: body,
    ContentType: "video/mp4",
  })
);
const url = `${PUBLIC}/${KEY}`;
console.log("Uploaded:", url);

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
try {
  await sql`
    insert into settings (key, value, updated_at)
    values ('landing', ${sql.json({ showreelUrl: url })}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  console.log("Settings row 'landing' saved.");
} finally {
  await sql.end();
}
