// Set CORS on the R2 bucket so browsers can read media pixel data via
// <canvas>.drawImage — the ProjectView theme detector samples luminance.
//
// Run: node --env-file=.env.local scripts/set-r2-cors.mjs
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

await r2.send(
  new PutBucketCorsCommand({
    Bucket: process.env.R2_BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          // Broad GET rule for public media reads. Uploads still go through
          // presigned PUT URLs so they don't need extra origins here.
          AllowedOrigins: ["*"],
          AllowedMethods: ["GET", "HEAD"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
          MaxAgeSeconds: 3600,
        },
        {
          // Presigned uploads from the admin panel.
          AllowedOrigins: [
            "http://localhost:3200",
            "https://tnf-website-2026.vercel.app",
          ],
          AllowedMethods: ["PUT", "POST"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  })
);
console.log("R2 CORS updated.");
