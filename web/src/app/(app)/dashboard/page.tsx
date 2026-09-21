import Link from "next/link";
import { apiGet, type OrgProfile, type PostSummary, type Summary } from "@/lib/api";
import StatTile from "@/components/StatTile";
import TrendChart from "@/components/TrendChart";
import SponsorTable from "@/components/SponsorTable";
import ConnectAccount from "./ConnectAccount";
import { compact, money, shortDate } from "@/lib/format";

export default async function DashboardPage() {
  const [summary, profile, posts] = await Promise.all([
    apiGet<Summary>("/v1/org/summary?days=90"),
    apiGet<OrgProfile>("/v1/org"),
    apiGet<{ posts: PostSummary[] }>("/v1/posts?days=90&limit=6"),
  ]);

  const instagram = profile.socialAccounts.find((account) => account.platform === "instagram");

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Last 90 days</p>
          <h1 className="display text-4xl font-bold leading-none">{profile.org.shortName}</h1>
          <p className="mt-1 text-[var(--muted)]">
            {profile.org.division} · {profile.org.sport}
          </p>
        </div>
        {instagram ? <ConnectAccount account={instagram} /> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Sponsor media value" value={money(summary.totals.value)} note={`${summary.totals.sponsors} sponsors`} />
        <StatTile label="Posts analyzed" value={String(summary.totals.posts)} note="Instagram" />
        <StatTile label="Impressions" value={compact(summary.totals.impressions)} note="Across analyzed posts" />
        <StatTile label="Logo appearances" value={String(summary.totals.detections)} note="Counted towards value" />
      </div>

      <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)]">
        <h2 className="display px-5 pt-4 text-xl font-semibold">Media value by week</h2>
        <div className="px-3 pb-3">
          <TrendChart points={summary.trend.map((week) => ({ label: week.label, value: week.value }))} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-5 pb-4">
          <div className="flex items-center justify-between pt-4">
            <h2 className="display text-xl font-semibold">Top sponsors</h2>
            <Link href="/sponsors" className="text-sm text-[var(--muted)] hover:text-[var(--turf)]">
              All sponsors
            </Link>
          </div>
          <SponsorTable rows={summary.topSponsors} />
        </section>

        <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-5 pb-5">
          <div className="flex items-center justify-between pt-4">
            <h2 className="display text-xl font-semibold">Recent posts</h2>
            <Link href="/posts" className="text-sm text-[var(--muted)] hover:text-[var(--turf)]">
              All posts
            </Link>
          </div>
          <ul className="mt-3 grid gap-3">
            {posts.posts.map((post) => (
              <li key={post.id}>
                <Link href={`/posts/${post.id}`} className="flex items-center gap-3 hover:opacity-90">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.imageUrl} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{post.caption}</span>
                    <span className="block text-xs text-[var(--muted)]">
                      {shortDate(post.postedAt)} · {post.detectionCount} logos · {money(post.value)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
