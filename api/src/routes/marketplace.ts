/**
 * The anonymised marketplace.
 *
 * The rule that matters: no response from this file may contain another club's name,
 * slug or id, and no metric may be derived from a cohort small enough to identify a
 * single club. Anonymising in the UI would be no protection at all, because anyone can
 * read the network tab.
 */
import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import { db } from "../db.js";
import { cpmLookup, postsForOrg } from "../queries.js";
import { detectionQuality, percentileOf, postValue, quantile } from "../scoring.js";

const MIN_COHORT = 3;

type OrgMetrics = {
  valuePerPost: number;
  impressionsPerPost: number;
  logosPerPost: number;
  averageQuality: number;
};

async function metricsFor(orgId: string, days: number): Promise<OrgMetrics | null> {
  const [posts, cpmFor] = await Promise.all([postsForOrg(orgId, days), cpmLookup(orgId)]);
  if (!posts.length) return null;

  const counted = posts.flatMap((post) => post.detections.filter((d) => d.counted));
  return {
    valuePerPost: posts.reduce((sum, post) => sum + postValue(post, cpmFor), 0) / posts.length,
    impressionsPerPost: posts.reduce((sum, post) => sum + post.impressions, 0) / posts.length,
    logosPerPost: counted.length / posts.length,
    averageQuality: counted.length
      ? counted.reduce((sum, d) => sum + detectionQuality(d), 0) / counted.length
      : 0,
  };
}

const METRICS: { key: keyof OrgMetrics; label: string; unit: string }[] = [
  { key: "valuePerPost", label: "Media value per post", unit: "currency" },
  { key: "impressionsPerPost", label: "Impressions per post", unit: "number" },
  { key: "logosPerPost", label: "Sponsor logos per post", unit: "decimal" },
  { key: "averageQuality", label: "Average logo quality", unit: "index" },
];

export async function registerMarketplaceRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const days = Number((request.query as { days?: string }).days ?? 90);

    const org = await db.org.findUniqueOrThrow({ where: { id: user.orgId } });
    const cohortOrgs = await db.org.findMany({
      where: { sport: org.sport, division: org.division, id: { not: org.id } },
      select: { id: true },
    });

    if (cohortOrgs.length + 1 < MIN_COHORT) {
      return {
        cohort: { description: `${org.division}`, size: cohortOrgs.length + 1, sufficient: false },
        benchmarks: [],
        note: "Too few clubs in this cohort to publish benchmarks without identifying them.",
      };
    }

    const mine = await metricsFor(org.id, days);
    const others = (await Promise.all(cohortOrgs.map((other) => metricsFor(other.id, days)))).filter(
      (value): value is OrgMetrics => value !== null,
    );

    const benchmarks = METRICS.map(({ key, label, unit }) => {
      const cohort = others.map((metrics) => metrics[key]).sort((a, b) => a - b);
      const yourValue = mine?.[key] ?? 0;
      return {
        metric: key,
        label,
        unit,
        yourValue,
        cohortMedian: quantile(cohort, 0.5),
        cohortP25: quantile(cohort, 0.25),
        cohortP75: quantile(cohort, 0.75),
        percentile: percentileOf(yourValue, cohort),
        cohortSize: cohort.length,
      };
    });

    // Category mix across the cohort: which sponsor categories others carry, counted
    // only in aggregate so no single club's roster can be read off.
    const cohortDetections = await db.detection.groupBy({
      by: ["sponsorId"],
      where: {
        counted: true,
        post: { orgId: { in: cohortOrgs.map((other) => other.id) }, postedAt: { gte: new Date(Date.now() - days * 864e5) } },
      },
      _count: { _all: true },
    });
    const sponsors = await db.sponsor.findMany({
      where: { id: { in: cohortDetections.map((row) => row.sponsorId) } },
      select: { id: true, category: true },
    });
    const categoryById = new Map(sponsors.map((sponsor) => [sponsor.id, sponsor.category]));
    const categoryTotals = new Map<string, number>();
    for (const row of cohortDetections) {
      const category = categoryById.get(row.sponsorId) ?? "uncategorised";
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + row._count._all);
    }

    return {
      cohort: {
        description: `${org.division}, ${org.sport}`,
        size: cohortOrgs.length + 1,
        sufficient: true,
        window: { days },
      },
      benchmarks,
      categoryMix: [...categoryTotals.entries()]
        .map(([category, appearances]) => ({ category, appearances }))
        .sort((a, b) => b.appearances - a.appearances),
    };
  });
}
