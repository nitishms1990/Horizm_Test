"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Account = { platform: string; handle: string; connectedAt: string | null; demo: boolean };

/**
 * Pilot stand-in for the Instagram connection. Real integration means a Meta app and
 * business-account review; this switches the club's seeded feed on and is labelled as
 * a demo connection wherever it appears.
 */
export default function ConnectAccount({ account }: { account: Account }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const connected = Boolean(account.connectedAt);

  async function toggle() {
    setBusy(true);
    await fetch(`/api/v1/org/social/${account.platform}/connect`, { method: "POST" });
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-4 py-3">
      <p className="label">Instagram</p>
      <p className="text-sm font-semibold">@{account.handle}</p>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={toggle}
          disabled={busy}
          className={`rounded px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${
            connected
              ? "border border-[var(--rule)]"
              : "bg-[var(--turf)] text-[var(--on-turf)]"
          }`}
        >
          {busy ? "Working…" : connected ? "Disconnect" : "Connect Instagram"}
        </button>
        {connected ? <span className="label">Demo connection</span> : null}
      </div>
    </div>
  );
}
