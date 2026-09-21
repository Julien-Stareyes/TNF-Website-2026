import { NextResponse } from "next/server";
import { signIn, signOut } from "@/lib/auth";

export async function POST(req) {
  const { password, action } = await req.json();
  if (action === "signout") {
    await signOut();
    return NextResponse.json({ ok: true });
  }
  const ok = await signIn(password);
  return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
}
