/**
 * Synthetic audience data, shaped like Instagram's insights.
 *
 * Instagram gives a business account aggregate cohorts — share of followers by country,
 * city, age band and gender — never individual people, and only above a minimum audience
 * size. The model here mirrors that, so swapping the seed for real API pulls later is a
 * change of source, not of shape.
 */
import { db } from "../db.js";

export const MARKET_RATES = [
  { country: "GB", label: "United Kingdom", cpmIndex: 1 },
  { country: "IE", label: "Ireland", cpmIndex: 0.85 },
  { country: "US", label: "United States", cpmIndex: 1.25 },
  { country: "NO", label: "Norway", cpmIndex: 1.1 },
  { country: "AU", label: "Australia", cpmIndex: 0.9 },
  { country: "DE", label: "Germany", cpmIndex: 0.95 },
  { country: "IN", label: "India", cpmIndex: 0.35 },
  { country: "NG", label: "Nigeria", cpmIndex: 0.25 },
];

const AGE_BANDS = [
  { key: "13-17", label: "13 to 17", weight: 0.06 },
  { key: "18-24", label: "18 to 24", weight: 0.19 },
  { key: "25-34", label: "25 to 34", weight: 0.31 },
  { key: "35-44", label: "35 to 44", weight: 0.22 },
  { key: "45-54", label: "45 to 54", weight: 0.13 },
  { key: "55-64", label: "55 to 64", weight: 0.06 },
  { key: "65+", label: "65 and over", weight: 0.03 },
];

const GENDERS = [
  { key: "male", label: "Men", weight: 0.71 },
  { key: "female", label: "Women", weight: 0.27 },
  { key: "unspecified", label: "Not specified", weight: 0.02 },
];

type Slice = { key: string; label: string; weight: number };

/** Normalise a set of weights into shares that sum to 1. */
function shares(slices: Slice[], random: () => number, spread = 0.25): { key: string; label: string; share: number }[] {
  const noisy = slices.map((slice) => ({
    ...slice,
    weight: Math.max(0.005, slice.weight * (1 + (random() - 0.5) * spread)),
  }));
  const total = noisy.reduce((sum, slice) => sum + slice.weight, 0);
  return noisy.map((slice) => ({ key: slice.key, label: slice.label, share: slice.weight / total }));
}

export async function seedMarketRates() {
  for (const rate of MARKET_RATES) {
    await db.marketRate.upsert({ where: { country: rate.country }, update: rate, create: rate });
  }
}

export async function seedAudience(options: {
  orgId: string;
  followers: number;
  homeCity: string;
  random: () => number;
  weeks: number;
}) {
  const { orgId, followers, homeCity, random, weeks } = options;

  // An English second-tier club: mostly domestic, with a long diaspora tail.
  const countries: Slice[] = [
    { key: "GB", label: "United Kingdom", weight: 0.68 },
    { key: "IE", label: "Ireland", weight: 0.07 },
    { key: "US", label: "United States", weight: 0.06 },
    { key: "IN", label: "India", weight: 0.05 },
    { key: "NG", label: "Nigeria", weight: 0.04 },
    { key: "AU", label: "Australia", weight: 0.035 },
    { key: "NO", label: "Norway", weight: 0.03 },
    { key: "DE", label: "Germany", weight: 0.025 },
  ];

  const cities: Slice[] = [
    { key: homeCity, label: homeCity, weight: 0.34 },
    { key: "London", label: "London", weight: 0.11 },
    { key: "Manchester", label: "Manchester", weight: 0.05 },
    { key: "Dublin", label: "Dublin", weight: 0.04 },
    { key: "New York", label: "New York", weight: 0.03 },
    { key: "Mumbai", label: "Mumbai", weight: 0.025 },
    { key: "Lagos", label: "Lagos", weight: 0.02 },
    { key: "Oslo", label: "Oslo", weight: 0.015 },
  ];

  for (let week = weeks - 1; week >= 0; week--) {
    const capturedAt = new Date(Date.now() - week * 7 * 24 * 60 * 60 * 1000);
    // Followers drift up by roughly a third of a percent a week.
    const growth = Math.pow(1.003, weeks - 1 - week) * (1 + (random() - 0.5) * 0.004);
    const totalFollowers = Math.round(followers * growth);
    const reach28d = Math.round(totalFollowers * (0.55 + random() * 0.35));

    const snapshot = await db.audienceSnapshot.create({
      data: { orgId, capturedAt, followers: totalFollowers, reach28d },
    });

    const rows = [
      ...shares(countries, random, 0.12).map((slice) => ({ dimension: "country", ...slice })),
      ...shares(cities, random, 0.18).map((slice) => ({ dimension: "city", ...slice })),
      ...shares(AGE_BANDS, random, 0.1).map((slice) => ({ dimension: "age", ...slice })),
      ...shares(GENDERS, random, 0.06).map((slice) => ({ dimension: "gender", ...slice })),
    ];

    await db.audienceBreakdown.createMany({
      data: rows.map((row) => ({
        snapshotId: snapshot.id,
        dimension: row.dimension,
        key: row.key,
        label: row.label,
        share: row.share,
        followers: Math.round(totalFollowers * row.share),
      })),
    });
  }
}
