// Backfill the boilerplate TNF description into every project that
// doesn't already have one. Matches the placeholder ProjectView used to
// show as a fallback; operators can then override per project from the
// admin editor.
//
// Run: node --env-file=.env.local scripts/backfill-description.mjs
import postgres from "postgres";

const DEFAULT_DESCRIPTION =
  "THE NEW FACE is an expressive research-driven creative practice & think tank within.\n\nWith a focus on experimentation it serves as a framework to drive exploration at the edges of emergent visual and technical cultures.";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
try {
  const rows = await sql`
    update projects
       set description = ${DEFAULT_DESCRIPTION},
           updated_at = now()
     where description is null or description = ''
     returning slug
  `;
  console.log(`Filled description on ${rows.length} project(s).`);
  for (const r of rows) console.log(`  - ${r.slug}`);
} finally {
  await sql.end();
}
