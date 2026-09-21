import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import { cpmLookup, postsForOrg, weeklyBuckets } from "../queries.js";
import { detectionQuality, postValue, sponsorRows } from "../scoring.js";

export async function registerSponsorRoutes(app: FastifyInstance) {
  /** The club's sponsor league table for the window. */
  app.get("/", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const days = Number((request.query as { days?: string }).days ?? 90);

    const [posts, cpmFor] = await Promise.all([postsForOrg(user.orgId, days), cpmLookup(user.orgId)]);
    return { window: { days }, sponsors: sponsorRows(posts, cpmFor) };
  });

  /** One sponsor: where it appeared, how that moved week to week, and in which posts. */
  app.get("/:sponsorId", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { sponsorId } = request.params as { sponsorId: string };
    const days = Number((request.query as { days?: string }).days ?? 90);

    const [posts, cpmFor] = await Promise.all([postsForOrg(user.orgId, days), cpmLookup(user.orgId)]);
    const withSponsor = posts.filter((post) => post.detections.some((d) => d.sponsorId === sponsorId));
    if (!withSponsor.length) return reply.code(404).send({ error: "No appearances for that sponsor." });

    const onlyThisSponsor = withSponsor.map((post) => ({
      ...post,
      detections: post.detections.filter((d) => d.sponsorId === sponsorId),
    }));
    const [row] = sponsorRows(onlyThisSponsor, cpmFor);

    const byPlacement = new Map<string, { appearances: number; quality: number }>();
    for (const post of onlyThisSponsor) {
      for (const d of post.detections) {
        if (!d.counted) continue;
        const entry = byPlacement.get(d.placement) ?? { appearances: 0, quality: 0 };
        entry.appearances += 1;
        entry.quality += detectionQuality(d);
        byPlacement.set(d.placement, entry);
      }
    }

    const trend = weeklyBuckets(days).map((bucket) => {
      const inWeek = onlyThisSponsor.filter((post) => post.postedAt >= bucket.start && post.postedAt < bucket.end);
      return {
        label: bucket.label,
        appearances: inWeek.reduce((sum, post) => sum + post.detections.filter((d) => d.counted).length, 0),
        value: inWeek.reduce((sum, post) => sum + postValue(post, cpmFor), 0),
      };
    });

    return {
      sponsor: row,
      placements: [...byPlacement.entries()]
        .map(([placement, entry]) => ({
          placement,
          appearances: entry.appearances,
          averageQuality: entry.quality / entry.appearances,
        }))
        .sort((a, b) => b.appearances - a.appearances),
      trend,
      posts: onlyThisSponsor.slice(0, 12).map((post) => ({
        id: post.id,
        caption: post.caption,
        postedAt: post.postedAt.toISOString(),
        imageUrl: `/media/${post.imagePath}`,
        impressions: post.impressions,
        appearances: post.detections.filter((d) => d.counted).length,
        value: postValue(post, cpmFor),
      })),
    };
  });
}
