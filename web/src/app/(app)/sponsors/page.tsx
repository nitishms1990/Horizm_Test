import { apiGet, type SponsorList } from "@/lib/api";
import SponsorTable from "@/components/SponsorTable";
import { money } from "@/lib/format";

export default async function SponsorsPage() {
  const data = await apiGet<SponsorList>("/v1/sponsors?days=90");
  const total = data.sponsors.reduce((sum, sponsor) => sum + sponsor.value, 0);

  return (
    <div className="grid gap-6">
      <div>
        <p className="label">Last {data.window.days} days</p>
        <h1 className="display text-4xl font-bold leading-none">Sponsors</h1>
        <p className="mt-1 text-[var(--muted)]">
          {data.sponsors.length} sponsors · {money(total)} of media value across analyzed posts
        </p>
      </div>

      <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-5 pb-4 pt-2">
        <SponsorTable rows={data.sponsors} />
      </section>
    </div>
  );
}
