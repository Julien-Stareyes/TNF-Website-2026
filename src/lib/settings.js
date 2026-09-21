import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { settings } = schema;

// Read one settings blob by key. Returns null if not set yet.
export async function getSetting(key) {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

// Upsert one settings blob.
export async function setSetting(key, value) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}

// Convenience: the landing showreel URL (played on `/`).
export async function getLanding() {
  const v = await getSetting("landing");
  return v ?? { showreelUrl: null };
}

// Default copy the Info page falls back to before an operator has
// touched the admin. Everything here is overridable from /admin -- see
// InfoSection.jsx (About paragraph, the 5 services bullets, the client
// logo strip).
const INFO_DEFAULTS = {
  aboutBody:
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  servicesItems: [
    "Lorem ipsum dolor sit amet",
    "Consectetur adipiscing elit",
    "Sed do eiusmod tempor incididunt",
    "Ut labore et dolore magna aliqua",
    "Ut enim ad minim veniam",
  ],
  // Empty by default -- InfoPage/LogoMarquee fall back to the six
  // built-in client marks until an operator uploads real logos here.
  logos: [],
};

// Per-tab publish state, so a section that isn't finished can be parked
// without pulling its code:
//   live   — renders normally
//   soon   — nav link stays, the page shows a holding screen
//   hidden — nav link disappears too
export const TAB_KEYS = ["image", "immersive", "index", "info"];

export async function getTabStates() {
  const v = (await getSetting("tabs")) ?? {};
  return Object.fromEntries(
    TAB_KEYS.map((k) => [k, v[k] === "soon" || v[k] === "hidden" ? v[k] : "live"])
  );
}

// Copy shown bottom-left on the Immersive carousel.
export async function getImmersive() {
  const v = await getSetting("immersive");
  return {
    intro:
      v?.intro ??
      "We create virtual worlds and immersive experiences that bring brands to life in new dimensions.",
  };
}

export async function getInfo() {
  const v = await getSetting("info");
  // Shallow-merge stored blob over defaults so a partially-authored info
  // row still fills in every field the page renders.
  return {
    ...INFO_DEFAULTS,
    ...(v ?? {}),
    servicesItems: v?.servicesItems?.length
      ? v.servicesItems
      : INFO_DEFAULTS.servicesItems,
    logos: Array.isArray(v?.logos) ? v.logos : INFO_DEFAULTS.logos,
  };
}
