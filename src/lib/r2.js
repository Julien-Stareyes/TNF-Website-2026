import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is S3-compatible; the AWS SDK works verbatim, we just point
// it at R2's account-scoped endpoint and use the Access Key/Secret from the
// R2 API token.
export const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET;
const PUBLIC = process.env.R2_PUBLIC_URL;

// Turn an object key ("projects/prada-magazine/image/cover-desktop.mp4")
// into a browser-usable URL served by R2's public dev domain (or a custom
// domain later — behavior identical).
export const publicUrl = (key) => `${PUBLIC}/${key.replace(/^\//, "")}`;

// Presigned PUT for direct-from-browser uploads. The admin panel asks the
// server for one of these, then PUTs the file straight to R2 — the server
// never sees the file bytes.
export async function presignPut(key, contentType, expiresInSec = 300) {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(r2, cmd, { expiresIn: expiresInSec });
  return { url, key, publicUrl: publicUrl(key) };
}

export async function deleteObject(key) {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// Direct server-side upload -- used by /api/upload-proxy for small,
// same-origin-only uploads (the Info page's client logos) where a
// presigned browser-to-R2 PUT isn't an option: that bucket has no CORS
// policy configured (inherited project, no R2 dashboard access), so the
// browser's cross-origin PUT preflight always fails. Routing the bytes
// through our own server instead sidesteps CORS entirely, the same way
// /api/media-proxy does for reads. Kept opt-in (not the default upload
// path) because it puts the file through the app server rather than
// straight to R2, which doesn't suit the large video uploads elsewhere
// in the admin.
export async function putObject(key, body, contentType) {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return { key, publicUrl: publicUrl(key) };
}
