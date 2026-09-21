"use client";

import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={signOut} className="rounded border border-[var(--rule)] px-3 py-1.5 text-sm">
      Sign out
    </button>
  );
}
