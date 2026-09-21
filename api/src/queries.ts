/**
 * Every read of club data goes through here, and every function takes an orgId that
 * came from the session. Nothing accepts an org from the request body.
 */
import { db } from "./db.js";
import type { PostRow } from "./scoring.js";

export function windowStart(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** CPM lookup for one club, falling back to a house rate when a placement isn't priced. */
export async function cpmLookup(orgId: string): Promise<(placement: string) => number> {
  const cards = await db.rateCard.findMany({ where: { orgId } });
  const byPlacement = new Map(cards.map((card) => [card.placement, card.cpm]));
  const fallback = byPlacement.get("other") ?? 8;
  return (placement: string) => byPlacement.get(placement) ?? fallback;
}

export async function postsForOrg(orgId: string, days: number): Promise<(PostRow & {
  postedAt: Date;
  caption: string;
  imagePath: string;
  likes: number;
  comments: number;
})[]> {
  const posts = await db.post.findMany({
    where: { orgId, postedAt: { gte: windowStart(days) } },
    orderBy: { postedAt: "desc" },
    include: { detections: { include: { sponsor: true } } },
  });

  return posts.map((post) => ({
    id: post.id,
    impressions: post.impressions,
    postedAt: post.postedAt,
    caption: post.caption,
    imagePath: post.imagePath,
    likes: post.likes,
    comments: post.comments,
    detections: post.detections.map((d) => ({
      id: d.id,
      sponsorId: d.sponsorId,
      sponsorName: d.sponsor.name,
      placement: d.placement,
      sizePct: d.sizePct,
      clarity: d.clarity,
      obstruction: d.obstruction,
      counted: d.counted,
    })),
  }));
}

/** Week buckets, oldest first, for the trend charts. */
export function weeklyBuckets(days: number): { start: Date; end: Date; label: string }[] {
  const weeks = Math.max(1, Math.round(days / 7));
  const buckets: { start: Date; end: Date; label: string }[] = [];
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    buckets.push({
      start,
      end,
      label: start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    });
  }
  return buckets;
}
