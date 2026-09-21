"use client";
import { useState } from "react";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setPending(true);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setPending(false);
    if (res.ok) window.location.reload();
    else setError("Wrong password.");
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 font-mono">
      <h1 className="text-lg tracking-widest">T.N.F Admin</h1>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full bg-white/5 border border-white/10 px-3 py-2 rounded outline-none focus:border-white/30"
        autoFocus
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-white text-black py-2 rounded disabled:opacity-40"
      >
        {pending ? "…" : "Sign in"}
      </button>
    </form>
  );
}
