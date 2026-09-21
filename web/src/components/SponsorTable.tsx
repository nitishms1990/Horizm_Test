import Link from "next/link";
import { index, money } from "@/lib/format";

type Row = { sponsorId: string; name: string; appearances: number; exposure: number; value: number };

export default function SponsorTable({ rows }: { rows: Row[] }) {
  if (!rows.length) {
    return <p className="p-4 text-sm text-[var(--muted)]">No sponsor logos found in this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse tabular text-sm">
        <thead>
          <tr className="label">
            <th className="py-2 text-left font-medium">Sponsor</th>
            <th className="py-2 text-right font-medium">Appearances</th>
            <th className="py-2 text-left font-medium pl-4">Avg quality</th>
            <th className="py-2 text-right font-medium">Media value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sponsorId} className="border-t border-[var(--rule)]">
              <td className="py-2.5 font-semibold">
                <Link href={`/sponsors/${row.sponsorId}`} className="hover:text-[var(--turf)]">
                  {row.name}
                </Link>
              </td>
              <td className="py-2.5 text-right">{row.appearances}</td>
              <td className="py-2.5 pl-4">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded bg-[var(--turf-soft)]">
                    <div className="h-full bg-[var(--turf)]" style={{ width: `${Math.round(row.exposure * 100)}%` }} />
                  </div>
                  <span className="font-mono text-xs">{index(row.exposure)}</span>
                </div>
              </td>
              <td className="py-2.5 text-right">{money(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
