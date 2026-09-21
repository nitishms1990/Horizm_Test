import Link from "next/link";
import { PLACEMENTS, type Placement } from "@horizm/contracts";
import { apiGet, type SponsorDetail } from "@/lib/api";
import TrendChart from "@/components/TrendChart";
import StatTile from "@/components/StatTile";
import { compact, index, money, shortDate } from "@/lib/format";

const asPlacement = (value: string): Placement =>
  (Object.prototype.hasOwnProperty.call(PLACEMENTS, value) ? value : "other") as Placement;

export default async function SponsorPage({ params }: { params: Promise<{ sponsorId: string }> }) {
  const { sponsorId } = await params;
  const detail = await apiGet<SponsorDetail>(`/v1/sponsors/${sponsorId}?days=90`);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Sponsor · last 90 days</p>
          <h1 className="display text-4xl font-bold leading-none">{detail.sponsor.name}</h1>
        </div>
        <Link href="/sponsors" className="text-sm text-[var(--muted)] hover:text-[var(--turf)]">
          All sponsors
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Media value" value={money(detail.sponsor.value)} />
        <StatTile label="Appearances" value={String(detail.sponsor.appearances)} note="Counted logo appearances" />
        <StatTile label="Average quality" value={index(detail.sponsor.exposure)} note="Out of 100 per appearance" />
      </div>

      <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)]">
        <h2 className="display px-5 pt-4 text-xl font-semibold">Value by week</h2>
        <div className="px-3 pb-3">
          <TrendChart points={detail.trend.map((week) => ({ label: week.label, value: week.value }))} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-5 pb-4">
          <h2 className="display pt-4 text-xl font-semibold">Where it appears</h2>
          <table className="w-full border-collapse tabular text-sm">
            <tbody>
              {detail.placements.map((row) => (
                <tr key={row.placement} className="border-t border-[var(--rule)]">
                  <td className="py-2.5 font-semibold">{PLACEMENTS[asPlacement(row.placement)].label}</td>
                  <td className="py-2.5 text-right text-[var(--muted)]">{row.appearances} appearances</td>
                  <td className="py-2.5 text-right font-mono text-xs">{index(row.averageQuality)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-5 pb-5">
          <h2 className="display pt-4 text-xl font-semibold">Recent posts</h2>
          <ul className="mt-3 grid gap-3">
            {detail.posts.map((post) => (
              <li key={post.id}>
                <Link href={`/posts/${post.id}`} className="flex items-center gap-3 hover:opacity-90">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.imageUrl} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{post.caption}</span>
                    <span className="block text-xs text-[var(--muted)]">
                      {shortDate(post.postedAt)} · {compact(post.impressions)} impressions · {post.appearances} appearances
                    </span>
                  </span>
                  <span className="tabular text-sm font-semibold">{money(post.value)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
