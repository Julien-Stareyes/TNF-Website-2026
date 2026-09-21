// Seed the Immersive tab with the projects that actually exist in the
// catalogue. Mobilize, Mobilize game and Logitech G512 have no project
// row yet, so they're left out until someone creates them.
import postgres from "postgres";

const SLUGS = [
  "logitech-immerssive",
  "harpers-colective-store",
  "mcm-harper-collective-x-mcm",
  "pucci-croix-rouge",
];

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
try {
  for (const [position, slug] of SLUGS.entries()) {
    const [row] = await sql`select id from projects where slug = ${slug}`;
    if (!row) {
      console.log(`skip  ${slug} (no such project)`);
      continue;
    }
    await sql`
      insert into project_tabs (project_id, tab, position, published)
      values (${row.id}, 'immersive', ${position}, true)
      on conflict (project_id, tab)
      do update set position = excluded.position, published = true
    `;
    console.log(`ok    ${slug} -> immersive #${position + 1}`);
  }
} finally {
  await sql.end();
}
