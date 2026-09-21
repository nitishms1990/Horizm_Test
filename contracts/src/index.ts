/**
 * The agreement between the API and the web app.
 *
 * Everything here is shared: the shape of an analysis, the placement types and their
 * weights, and the scoring rules. Changing a field here changes both sides at once,
 * and TypeScript points at every place that needs updating.
 */
import { z } from "zod";

/** Where a logo sits, and how much that position is worth relative to a shirt front. */
export const PLACEMENTS = {
  shirt_front: { label: "Shirt front", weight: 1.0, note: "Front of the playing shirt" },
  broadcast_overlay: { label: "Broadcast overlay", weight: 0.9, note: "Scorebug, replay or on-screen graphic" },
  backdrop: { label: "Backdrop", weight: 0.9, note: "Interview or press-conference wall" },
  perimeter_board: { label: "Perimeter board", weight: 0.8, note: "LED or static pitch-side board" },
  kit_other: { label: "Kit, other", weight: 0.6, note: "Sleeve, shorts, shirt back, training wear" },
  signage: { label: "Stadium signage", weight: 0.6, note: "Stand fascias, gantries, concourse signs" },
  equipment: { label: "Equipment", weight: 0.6, note: "Ball, bat, posts, corner flags" },
  other: { label: "Other", weight: 0.5, note: "Anything else" },
} as const;

export type Placement = keyof typeof PLACEMENTS;
export const PLACEMENT_KEYS = Object.keys(PLACEMENTS) as [Placement, ...Placement[]];
export const placementSchema = z.enum(PLACEMENT_KEYS);

/** A number that may arrive as a percentage (45) when a fraction (0.45) was asked for. */
const unitInterval = z.coerce
  .number()
  .transform((n) => (n > 1 && n <= 100 ? n / 100 : n))
  .pipe(z.number().min(0).max(1))
  .catch(0.5);

/** One logo, once, in one image. This is what the vision model is asked to produce. */
export const detectionSchema = z.object({
  brand: z.string().trim().min(1).max(60),
  placement: z.string().catch("other").pipe(placementSchema.catch("other")),
  location: z.string().trim().max(90).catch(""),
  x: unitInterval,
  y: unitInterval,
  size_pct: z.coerce.number().min(0).max(100).catch(0.5),
  clarity: unitInterval,
  obstruction: unitInterval.catch(0),
  confidence: unitInterval,
});
export type Detection = z.infer<typeof detectionSchema>;

/** The whole reply for one image. Entries that cannot be repaired are dropped. */
export const analysisSchema = z.object({
  scene: z.string().trim().max(300).catch(""),
  detections: z.array(detectionSchema.nullable().catch(null)).catch([]).transform((list) =>
    list.filter((d): d is Detection => d !== null),
  ),
});
export type Analysis = z.infer<typeof analysisSchema>;

/**
 * Scoring. Deliberately simple and all in one place, because these are the numbers a
 * client will argue with — see README for the reasoning behind each factor.
 */

/** How much of the frame the logo fills, on a 0-1 curve that tops out at 4% of the image. */
export function sizeFactor(sizePct: number): number {
  return Math.min(1, Math.sqrt(Math.max(0, sizePct) / 4));
}

/** One appearance, scored 0-1. */
export function quality(d: Pick<Detection, "size_pct" | "clarity" | "obstruction" | "placement">): number {
  return sizeFactor(d.size_pct) * d.clarity * (1 - d.obstruction) * PLACEMENTS[d.placement].weight;
}

/**
 * Several appearances of one sponsor, combined into a single 0-1 index. Repeats add up
 * with diminishing returns and can never reach 1 on their own.
 */
export function exposure(qualities: number[]): number {
  return 1 - qualities.reduce((miss, q) => miss * (1 - q), 1);
}

/** What that exposure is worth against a post's impressions at a given CPM. */
export function mediaValue(exposureIndex: number, impressions: number, cpm: number): number {
  return (impressions / 1000) * cpm * exposureIndex;
}

/** Shapes returned by the API, so the web app knows what it is rendering. */

export const sponsorRowSchema = z.object({
  sponsorId: z.string(),
  name: z.string(),
  appearances: z.number().int(),
  exposure: z.number(),
  value: z.number(),
});
export type SponsorRow = z.infer<typeof sponsorRowSchema>;

export const postSummarySchema = z.object({
  id: z.string(),
  caption: z.string(),
  postedAt: z.string(),
  imageUrl: z.string(),
  impressions: z.number().int(),
  likes: z.number().int(),
  comments: z.number().int(),
  detectionCount: z.number().int(),
  value: z.number(),
});
export type PostSummary = z.infer<typeof postSummarySchema>;

export const storedDetectionSchema = detectionSchema.extend({
  id: z.string(),
  sponsorName: z.string(),
  counted: z.boolean(),
});
export type StoredDetection = z.infer<typeof storedDetectionSchema>;

/**
 * The marketplace comparison. Deliberately carries no rival identity: a club can read
 * its own position, and nothing about who sits above or below it.
 */
export const benchmarkSchema = z.object({
  metric: z.string(),
  yourValue: z.number(),
  cohortMedian: z.number(),
  cohortP25: z.number(),
  cohortP75: z.number(),
  percentile: z.number(),
  cohortSize: z.number().int(),
});
export type Benchmark = z.infer<typeof benchmarkSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
