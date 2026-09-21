import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Serverless-friendly pool — Neon pools connections on their side so we can
// keep the client thin. Cached on the global so hot-reload in dev doesn't
// leak sockets.
const globalForDb = globalThis;
const sql =
  globalForDb.__pg ??
  postgres(process.env.DATABASE_URL, {
    ssl: "require",
    prepare: false, // Neon's pooler doesn't support prepared statements.
  });
if (process.env.NODE_ENV !== "production") globalForDb.__pg = sql;

export const db = drizzle(sql, { schema });
export { schema };
