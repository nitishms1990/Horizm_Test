"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("bristol-city@horizm.test");
  const [password, setPassword] = useState("pilot1234");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Sign-in failed. Try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Can't reach the API. Check that it's running on port 4000.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-md border border-[var(--rule)] bg-[var(--surface)] p-5">
      <div className="grid gap-1.5">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded border border-[var(--rule)] bg-[var(--ground)] px-3 py-2"
        />
      </div>

      <div className="grid gap-1.5">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded border border-[var(--rule)] bg-[var(--ground)] px-3 py-2"
        />
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded bg-[var(--turf)] px-4 py-2.5 font-semibold text-[var(--on-turf)] disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
