// One-off script: configures a CORS policy directly on the R2 bucket so
// presigned browser-to-R2 PUT uploads stop failing their preflight check.
// This is the real fix for the "network error" / CORS console error you
// see when uploading covers, gallery images, videos, etc. from the admin
// -- the bucket has never had a CORS policy (inherited project, no R2
// dashboard access), so every direct-from-browser PUT is blocked, not
// just the logo upload from before.
//
// Run this yourself, from your own machine (not through Claude's cloud
// sandbox, which has no network path to R2):
//
//   node scripts/set-r2-cors.mjs
//
// It reads R2_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
// from .env.local (same credentials the app already uses), so run it from
// the project root where .env.local lives.
//
// Note: this requires the R2 API token to have "Admin Read & Write"
// permissions (bucket-level config), not just "Object Read & Write". If
// this fails with a 403/Forbidden, the token doesn't have that scope --
// see the error handling below for what to do next.

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";

// Minimal .env.local parser (no extra dependency needed) -- same file the
// app itself reads via Next.js, just parsed by hand here.
function loadEnvLocal() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnvLocal();
const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;

if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error(
    "Missing one of R2_ENDPOINT / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in .env.local -- aborting."
  );
  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// Allowed origins: local dev, plus your Vercel project's default domain
// and any *.vercel.app preview deployment. Add your final custom domain
// here too once you have one (e.g. "https://tnf-website.com").
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://*.vercel.app",
  "https://www.thenewface.io",
];

const corsRule = {
  AllowedOrigins: ALLOWED_ORIGINS,
  AllowedMethods: ["GET", "PUT", "HEAD"],
  AllowedHeaders: ["*"],
  ExposeHeaders: ["ETag"],
  MaxAgeSeconds: 3600,
};

try {
  await r2.send(
    new PutBucketCorsCommand({
      Bucket: R2_BUCKET,
      CORSConfiguration: { CORSRules: [corsRule] },
    })
  );
  console.log("CORS policy applied to bucket:", R2_BUCKET);

  const check = await r2.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }));
  console.log("Current CORS rules:", JSON.stringify(check.CORSRules, null, 2));
  console.log(
    "\nDone. Try the video upload again in the admin -- the CORS error should be gone, for uploads of any size, on localhost and in production."
  );
} catch (err) {
  console.error("Failed to set CORS policy:", err.name, "-", err.message);
  if (err.$metadata?.httpStatusCode === 403 || /Forbidden|AccessDenied/i.test(err.name)) {
    console.error(
      "\nThis usually means your R2 API token only has 'Object Read & Write' " +
        "permissions, not 'Admin Read & Write' (bucket-level config). Ask " +
        "whoever manages the Cloudflare account to either add CORS via the " +
        "R2 dashboard (bucket -> Settings -> CORS Policy) using the rule " +
        "below, or issue you a token with Admin Read & Write scope so this " +
        "script can do it:\n" +
        JSON.stringify([corsRule], null, 2)
    );
  }
  process.exit(1);
}
