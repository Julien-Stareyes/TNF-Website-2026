// One-off runner: apply drizzle/0004_master_list.sql, then append the entry
// to drizzle/meta/_journal.json so drizzle-kit's own migrator still lines up.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error("Usage: node scripts/apply-migration.mjs <migration-file>");
  process.exit(1);
}

const sqlText = fs.readFileSync(migrationFile, "utf8");
const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

try {
  console.log(`Applying ${path.basename(migrationFile)}…`);
  await sql.unsafe(sqlText);
  console.log("OK");

  const journalPath = "drizzle/meta/_journal.json";
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const tag = path.basename(migrationFile, ".sql");
  const alreadyLogged = journal.entries.some((e) => e.tag === tag);
  if (!alreadyLogged) {
    journal.entries.push({
      idx: journal.entries.length,
      version: "7",
      when: Date.now(),
      tag,
      breakpoints: true,
    });
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
    console.log(`Journal updated with ${tag}`);
  }
} finally {
  await sql.end();
}
