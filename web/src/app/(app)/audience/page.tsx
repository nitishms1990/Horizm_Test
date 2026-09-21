import { apiGet, type Audience, type MarketValue } from "@/lib/api";
import StatTile from "@/components/StatTile";
import { compact, count, money, percent, shortDate } from "@/lib/format";

/** A labelled share bar, used for age bands, gender and cities. */
function ShareRow({ label, share, suffix }: { label: string; share: number; suffix?: string }) {
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-3 py-1.5">
      <div className="min-w-0">
        <div className="flex justify-between gap-3 text-sm">
          <span className="truncate">{label}</span>
          <span className="tabular text-[var(--muted)]">
            {percent(share)}
            {suffix ? ` · ${suffix}` : ""}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-[var(--turf-soft)]">
          <div className="h-full bg-[var(--turf)]" style={{ width: `${Math.max(2, share * 100)}%` }} />
        </div>
      </div>
    </li>
  );
}

export default async function AudiencePage() {
  const [audience, markets] = await Promise.all([
    apiGet<Audience>("/v1/audience"),
    apiGet<MarketValue>("/v1/audience/markets?days=90"),
  ]);

  const growth =
    audience.trend.length > 1
      ? audience.trend[audience.trend.length - 1].followers / audience.trend[0].followers - 1
      : 0;

  return (
    <div className="grid gap-6">
      <div>
        <p className="label">Captured {shortDate(audience.capturedAt)}</p>
        <h1 className="display text-4xl font-bold leading-none">Audience</h1>
        <p className="mt-1 max-w-2xl text-[var(--muted)]">{audience.note}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Followers" value={compact(audience.followers)} note={`${percent(growth)} over 12 weeks`} />
        <StatTile label="28-day reach" value={compact(audience.reach28d)} />
        <StatTile
          label="Home market share"
          value={percent(audience.breakdowns.country[0]?.share ?? 0)}
          note={audience.breakdowns.country[0]?.label}
        />
      </div>

      <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-5 pb-5">
        <h2 className="display pt-4 text-xl font-semibold">Sponsor value by market</h2>
        <p className="mb-2 text-sm text-[var(--muted)]">
          The last 90 days of exposure, split by where the audience is and re-priced with each market&apos;s CPM index.
          A thousand impressions in London and a thousand in Lagos are not worth the same to a sponsor.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse tabular text-sm">
            <thead>
              <tr className="label">
                <th className="py-2 text-left font-medium">Market</th>
                <th className="py-2 text-right font-medium">Audience</th>
                <th className="py-2 text-right font-medium">Impressions</th>
                <th className="py-2 text-right font-medium">CPM index</th>
                <th className="py-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {markets.markets.map((market) => (
                <tr key={market.country} className="border-t border-[var(--rule)]">
                  <td className="py-2.5 font-semibold">{market.label}</td>
                  <td className="py-2.5 text-right">{percent(market.audienceShare)}</td>
                  <td className="py-2.5 text-right">{compact(market.impressions)}</td>
                  <td className="py-2.5 text-right text-[var(--muted)]">{market.cpmIndex.toFixed(2)}</td>
                  <td className="py-2.5 text-right font-semibold">{money(market.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-5 pb-5">
          <h2 className="display pt-4 text-xl font-semibold">Age</h2>
          <ul>
            {audience.breakdowns.age.map((row) => (
              <ShareRow key={row.key} label={row.label} share={row.share} suffix={count(row.followers)} />
            ))}
          </ul>
        </section>

        <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-5 pb-5">
          <h2 className="display pt-4 text-xl font-semibold">Gender</h2>
          <ul>
            {audience.breakdowns.gender.map((row) => (
              <ShareRow key={row.key} label={row.label} share={row.share} suffix={count(row.followers)} />
            ))}
          </ul>
        </section>

        <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-5 pb-5">
          <h2 className="display pt-4 text-xl font-semibold">Cities</h2>
          <ul>
            {audience.breakdowns.city.map((row) => (
              <ShareRow key={row.key} label={row.label} share={row.share} suffix={count(row.followers)} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
