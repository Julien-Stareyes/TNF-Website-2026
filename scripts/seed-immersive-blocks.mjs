// Give one immersive project a starter layout matching the reference,
// so the block editor has something real to demonstrate.
import postgres from "postgres";

const uid = () => Math.random().toString(36).slice(2, 9);
const media = (o = {}) => ({ id: uid(), kind: "media", url: null, mediaType: "image", aspect: "auto", align: "start", span: 12, ...o });
const text = (o = {}) => ({ id: uid(), kind: "text", content: "", textAlign: "center", align: "center", span: 12, ...o });
const row = (o = {}) => ({ id: uid(), width: "wide", background: null, padY: "md", gap: "md", items: [], ...o });

const COPY =
  "THE NEW FACE is an expressive research-driven creative practice & think tank within\n\nWith a focus on experimentation it serves as a framework to drive exploration at the edges of emergent visual and technical cultures.";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
try {
  const [p] = await sql`
    select id, slug, gallery from projects where slug = 'pucci-croix-rouge'
  `;
  if (!p) {
    console.log("project not found");
    process.exit(0);
  }
  const g = p.gallery ?? [];
  const at = (i) => g[i] ? { url: g[i].url, mediaType: g[i].type ?? "image" } : {};

  const blocks = [
    // Hero — one full-bleed piece
    row({ width: "wide", padY: "sm", items: [media({ span: 12, ...at(0) })] }),
    // Centred intro copy
    row({ width: "narrow", padY: "md", items: [text({ span: 12, content: COPY })] }),
    // Two side by side, uneven
    row({ width: "wide", padY: "sm", gap: "md", items: [media({ span: 5, ...at(1) }), media({ span: 7, ...at(2) })] }),
    // A wide moving piece
    row({ width: "wide", padY: "sm", items: [media({ span: 12, aspect: "16/9", ...at(3) })] }),
    // Left-aligned copy
    row({ width: "wide", padY: "md", items: [text({ span: 6, content: COPY, textAlign: "left", align: "start" })] }),
    // Three across
    row({ width: "wide", padY: "sm", gap: "md", items: [media({ span: 4, ...at(4) }), media({ span: 4, ...at(5) }), media({ span: 4, ...at(6) })] }),
    // Dark band: copy · media · copy
    row({
      width: "full",
      padY: "lg",
      gap: "lg",
      background: "#141414",
      items: [
        text({ span: 3, content: "PUCCI CROIX ROUGE", align: "center", textAlign: "center", color: "#ffffff" }),
        media({ span: 6, align: "center", ...at(7) }),
        text({ span: 3, content: "PUCCI CROIX ROUGE", align: "center", textAlign: "center", color: "#ffffff" }),
      ],
    }),
  ];

  await sql`
    update projects
       set blocks = ${sql.json(blocks)},
           detail_mode = 'immersive',
           updated_at = now()
     where id = ${p.id}
  `;
  console.log(`Seeded ${blocks.length} rows onto ${p.slug} (gallery had ${g.length} items).`);
} finally {
  await sql.end();
}
