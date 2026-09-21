import { cookies } from "next/headers";

// Minimal admin gate — a single shared password compared against the
// server-only ADMIN_PASSWORD env var. On success we drop an httpOnly cookie
// whose value is the same secret (cheap tamper check on later requests).
const COOKIE = "tnf_admin";

export async function isAuthed() {
  const jar = await cookies();
  const c = jar.get(COOKIE);
  return c?.value && c.value === process.env.ADMIN_PASSWORD;
}

export async function signIn(password) {
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return false;
  }
  const jar = await cookies();
  jar.set(COOKIE, process.env.ADMIN_PASSWORD, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return true;
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
