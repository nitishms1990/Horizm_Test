import { apiGet, type Marketplace } from "@/lib/api";
import { compact, index, money } from "@/lib/format";

function formatValue(value: number, unit: string) {
  if (unit === "currency") return money(value);
  if (unit === "number") return compact(value);
  if (unit === "index") return index(value);
  return value.toFixed(1);
}

/** A simple position bar: the cohort's middle half, with your mark on it. */
function PositionBar({ p25, p75, median, yours }: { p25: number; p75: number; median: number; yours: number }) {
  const max = Math.max(p75, yours, median) * 1.15 || 1;
  const pct = (value: number) => `${Math.min(100, (value / max) * 100)}%`;

  return (
    <div className="relative h-8">
      <div className="absolute inset-x-0 top-3.5 h-1 rounded bg-[var(--rule)]" />
      <div
        className="absolute top-3 h-2 rounded bg-[var(--turf-soft)]"
        style={{ left: pct(p25), width: `calc(${pct(p75)} - ${pct(p25)})` }}
      />
      <div className="absolute top-2 h-4 w-0.5 bg-[var(--muted)]" style={{ left: pct(median) }} />
      <div
        className="absolute top-1 h-6 w-1.5 -translate-x-1/2 rounded bg-[var(--accent)]"
        style={{ left: pct(yours) }}
        title="Your club"
      />
    </div>
  );
}

export default async function MarketplacePage() {
  const data = await apiGet<Marketplace>("/v1/marketplace?days=90");

  return (
    <div className="grid gap-6">
      <div>
        <p className="label">Anonymised benchmarks</p>
        <h1 className="display text-4xl font-bold leading-none">Marketplace</h1>
        <p className="mt-1 max-w-2xl text-[var(--muted)]">
          Your position against {data.cohort.size - 1} other clubs in the {data.cohort.description}. Clubs are never
          named: the comparison is built from cohort medians and quartiles, and no rival identity is sent to this page.
        </p>
      </div>

      {!data.cohort.sufficient ? (
        <p className="rounded-md border border-[var(--rule)] bg-[var(--surface)] p-5 text-[var(--muted)]">{data.note}</p>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            {data.benchmarks.map((benchmark) => (
              <div key={benchmark.metric} className="rounded-md border border-[var(--rule)] bg-[var(--surface)] p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="label">{benchmark.label}</p>
                  <p className="font-mono text-xs text-[var(--muted)]">
                    {benchmark.percentile}th percentile
                  </p>
                </div>
                <p className="display tabular mt-1 text-4xl font-bold leading-none">
                  {formatValue(benchmark.yourValue, benchmark.unit)}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Cohort median {formatValue(benchmark.cohortMedian, benchmark.unit)} · middle half{" "}
                  {formatValue(benchmark.cohortP25, benchmark.unit)} to {formatValue(benchmark.cohortP75, benchmark.unit)}
                </p>
                <PositionBar
                  p25={benchmark.cohortP25}
                  p75={benchmark.cohortP75}
                  median={benchmark.cohortMedian}
                  yours={benchmark.yourValue}
                />
              </div>
            ))}
          </section>

          {data.categoryMix?.length ? (
            <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-5 pb-5">
              <h2 className="display pt-4 text-xl font-semibold">What the cohort carries</h2>
              <p className="mb-3 text-sm text-[var(--muted)]">
                Sponsor categories appearing across the other clubs, counted in aggregate. Use it to spot a category
                your competitors sell and you don&apos;t.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.categoryMix.map((row) => (
                  <li key={row.category} className="flex items-center justify-between gap-3 text-sm">
                    <span>{row.category}</span>
                    <span className="tabular text-[var(--muted)]">{row.appearances} appearances</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
