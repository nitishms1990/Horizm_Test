import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import { db } from "../db.js";
import { cpmLookup, postsForOrg, weeklyBuckets } from "../queries.js";
import { postValue, sponsorRows } from "../scoring.js";

export async function registerOrgRoutes(app: FastifyInstance) {
  /** The club's own profile, rate card and connected accounts. */
  app.get("/", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const org = await db.org.findUniqueOrThrow({
      where: { id: user.orgId },
      include: { rateCards: true, socialAccounts: true },
    });

    return {
      org: {
        id: org.id,
        slug: org.slug,
        name: org.name,
        shortName: org.shortName,
        sport: org.sport,
        division: org.division,
        primaryColor: org.primaryColor,
        accentColor: org.accentColor,
      },
      rateCard: org.rateCards.map((card) => ({ placement: card.placement, cpm: card.cpm })),
      socialAccounts: org.socialAccounts.map((account) => ({
        platform: account.platform,
        handle: account.handle,
        connectedAt: account.connectedAt?.toISOString() ?? null,
        demo: account.demo,
      })),
    };
  });

  /**
   * Pilot stand-in for the Instagram OAuth flow: flips the account to connected so the
   * seeded posts start showing. The real version is a Meta app and business-account
   * review, which is why this is marked `demo` everywhere it appears.
   */
  app.post("/social/:platform/connect", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { platform } = request.params as { platform: string };

    const account = await db.socialAccount.findUnique({
      where: { orgId_platform: { orgId: user.orgId, platform } },
    });
    if (!account) return reply.code(404).send({ error: "No such account for this club." });

    const updated = await db.socialAccount.update({
      where: { id: account.id },
      data: { connectedAt: account.connectedAt ? null : new Date() },
    });
    return { platform, connectedAt: updated.connectedAt?.toISOString() ?? null, demo: updated.demo };
  });

  /** Headline numbers, the weekly trend and the top sponsors, for the dashboard. */
  app.get("/summary", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const days = Number((request.query as { days?: string }).days ?? 90);

    const [posts, cpmFor] = await Promise.all([postsForOrg(user.orgId, days), cpmLookup(user.orgId)]);
    const rows = sponsorRows(posts, cpmFor);

    const buckets = weeklyBuckets(days).map((bucket) => {
      const inWeek = posts.filter((post) => post.postedAt >= bucket.start && post.postedAt < bucket.end);
      return {
        label: bucket.label,
        posts: inWeek.length,
        impressions: inWeek.reduce((sum, post) => sum + post.impressions, 0),
        value: inWeek.reduce((sum, post) => sum + postValue(post, cpmFor), 0),
      };
    });

    return {
      window: { days },
      totals: {
        posts: posts.length,
        impressions: posts.reduce((sum, post) => sum + post.impressions, 0),
        detections: posts.reduce((sum, post) => sum + post.detections.filter((d) => d.counted).length, 0),
        sponsors: rows.length,
        value: rows.reduce((sum, row) => sum + row.value, 0),
      },
      trend: buckets,
      topSponsors: rows.slice(0, 6),
    };
  });
}
