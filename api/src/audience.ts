/**
 * Audience reads and the one calculation that joins audience to exposure: what a
 * sponsor's visibility is worth once you account for where the people actually are.
 */
import { db } from "./db.js";
import { cpmLookup, postsForOrg } from "./queries.js";
import { postValue } from "./scoring.js";

export type BreakdownRow = { key: string; label: string; share: number; followers: number };

export async function latestAudience(orgId: string) {
  const snapshot = await db.audienceSnapshot.findFirst({
    where: { orgId },
    orderBy: { capturedAt: "desc" },
    include: { breakdowns: true },
  });
  if (!snapshot) return null;

  const byDimension = new Map<string, BreakdownRow[]>();
  for (const row of snapshot.breakdowns) {
    const rows = byDimension.get(row.dimension) ?? [];
    rows.push({ key: row.key, label: row.label, share: row.share, followers: row.followers });
    byDimension.set(row.dimension, rows);
  }
  for (const rows of byDimension.values()) rows.sort((a, b) => b.share - a.share);

  return {
    capturedAt: snapshot.capturedAt,
    followers: snapshot.followers,
    reach28d: snapshot.reach28d,
    country: byDimension.get("country") ?? [],
    city: byDimension.get("city") ?? [],
    age: byDimension.get("age") ?? [],
    gender: byDimension.get("gender") ?? [],
  };
}

export async function audienceTrend(orgId: string, weeks = 12) {
  const snapshots = await db.audienceSnapshot.findMany({
    where: { orgId },
    orderBy: { capturedAt: "asc" },
    take: 200,
  });
  return snapshots.slice(-weeks).map((snapshot) => ({
    label: snapshot.capturedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    followers: snapshot.followers,
    reach28d: snapshot.reach28d,
  }));
}

/**
 * Split a sponsor's media value across markets.
 *
 * Exposure is measured once, then distributed by the audience shares and re-priced with
 * each market's CPM index, because a thousand impressions in London and a thousand in
 * Lagos are not worth the same to a sponsor.
 */
export async function valueByMarket(orgId: string, options: { days: number; sponsorId?: string }) {
  const [posts, cpmFor, audience, rates] = await Promise.all([
    postsForOrg(orgId, options.days),
    cpmLookup(orgId),
    latestAudience(orgId),
    db.marketRate.findMany(),
  ]);
  if (!audience) return null;

  const relevant = options.sponsorId
    ? posts
        .map((post) => ({ ...post, detections: post.detections.filter((d) => d.sponsorId === options.sponsorId) }))
        .filter((post) => post.detections.length)
    : posts;

  const blendedValue = relevant.reduce((sum, post) => sum + postValue(post, cpmFor), 0);
  const impressions = relevant.reduce((sum, post) => sum + post.impressions, 0);
  const rateByCountry = new Map(rates.map((rate) => [rate.country, rate]));

  // Weight each market by share × its CPM index, then renormalise so the total value
  // is unchanged and only its distribution differs.
  const weighted = audience.country.map((row) => {
    const rate = rateByCountry.get(row.key);
    return { ...row, cpmIndex: rate?.cpmIndex ?? 0.5, marketLabel: rate?.label ?? row.label };
  });
  const weightTotal = weighted.reduce((sum, row) => sum + row.share * row.cpmIndex, 0) || 1;

  return {
    window: { days: options.days },
    totals: { value: blendedValue, impressions, posts: relevant.length },
    markets: weighted.map((row) => ({
      country: row.key,
      label: row.marketLabel,
      audienceShare: row.share,
      cpmIndex: row.cpmIndex,
      impressions: Math.round(impressions * row.share),
      value: (blendedValue * row.share * row.cpmIndex) / weightTotal,
    })),
  };
}
