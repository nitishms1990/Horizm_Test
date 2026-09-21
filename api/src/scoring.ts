/**
 * Turns stored detections into the numbers people actually look at: exposure per
 * sponsor, media value per post, and the anonymised cohort benchmarks.
 *
 * The maths itself lives in @horizm/contracts so the web app can show the same
 * figures without asking the API again when the CPM box changes.
 */
import { PLACEMENTS, exposure, mediaValue, quality, type Placement, type SponsorRow } from "@horizm/contracts";

export type DetectionRow = {
  id: string;
  sponsorId: string;
  sponsorName: string;
  placement: string;
  sizePct: number;
  clarity: number;
  obstruction: number;
  counted: boolean;
};

export type PostRow = {
  id: string;
  impressions: number;
  detections: DetectionRow[];
};

const asPlacement = (value: string): Placement =>
  (Object.prototype.hasOwnProperty.call(PLACEMENTS, value) ? value : "other") as Placement;

export function detectionQuality(d: DetectionRow): number {
  return quality({
    size_pct: d.sizePct,
    clarity: d.clarity,
    obstruction: d.obstruction,
    placement: asPlacement(d.placement),
  });
}

/** What one post was worth to one sponsor: exposure across that sponsor's logos in it. */
export function postValue(post: PostRow, cpmFor: (placement: string) => number): number {
  const bySponsor = new Map<string, { qualities: number[]; cpmWeighted: number }>();
  for (const d of post.detections) {
    if (!d.counted) continue;
    const entry = bySponsor.get(d.sponsorId) ?? { qualities: [], cpmWeighted: 0 };
    const q = detectionQuality(d);
    entry.qualities.push(q);
    entry.cpmWeighted += q * cpmFor(d.placement);
    bySponsor.set(d.sponsorId, entry);
  }

  let total = 0;
  for (const entry of bySponsor.values()) {
    const qualitySum = entry.qualities.reduce((sum, q) => sum + q, 0);
    // Blend the per-placement CPMs in proportion to where the exposure came from.
    const cpm = qualitySum > 0 ? entry.cpmWeighted / qualitySum : 0;
    total += mediaValue(exposure(entry.qualities), post.impressions, cpm);
  }
  return total;
}

/** Sponsor league table across a set of posts. */
export function sponsorRows(posts: PostRow[], cpmFor: (placement: string) => number): SponsorRow[] {
  const bySponsor = new Map<string, { name: string; appearances: number; qualities: number[]; value: number }>();

  for (const post of posts) {
    const perPost = new Map<string, number[]>();
    for (const d of post.detections) {
      if (!d.counted) continue;
      const entry = bySponsor.get(d.sponsorId) ?? { name: d.sponsorName, appearances: 0, qualities: [], value: 0 };
      const q = detectionQuality(d);
      entry.appearances += 1;
      entry.qualities.push(q);
      bySponsor.set(d.sponsorId, entry);
      perPost.set(d.sponsorId, [...(perPost.get(d.sponsorId) ?? []), q]);
    }
    // Value accrues post by post: each post's impressions count once per sponsor.
    for (const [sponsorId, qualities] of perPost) {
      const entry = bySponsor.get(sponsorId)!;
      const placements = post.detections.filter((d) => d.sponsorId === sponsorId && d.counted);
      const qualitySum = qualities.reduce((sum, q) => sum + q, 0);
      const cpm =
        qualitySum > 0
          ? placements.reduce((sum, d) => sum + detectionQuality(d) * cpmFor(d.placement), 0) / qualitySum
          : 0;
      entry.value += mediaValue(exposure(qualities), post.impressions, cpm);
    }
  }

  return [...bySponsor.entries()]
    .map(([sponsorId, entry]) => ({
      sponsorId,
      name: entry.name,
      appearances: entry.appearances,
      // A sponsor's headline exposure is its average per appearance, not a total that
      // would creep towards 100 simply because the season is long.
      exposure: entry.qualities.length
        ? entry.qualities.reduce((sum, q) => sum + q, 0) / entry.qualities.length
        : 0,
      value: entry.value,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Where a value sits inside a cohort, as a percentile from 0 to 100. */
export function percentileOf(value: number, cohort: number[]): number {
  if (!cohort.length) return 0;
  const below = cohort.filter((v) => v < value).length;
  return Math.round((below / cohort.length) * 100);
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}
