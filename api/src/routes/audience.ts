import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import { audienceTrend, latestAudience, valueByMarket } from "../audience.js";

export async function registerAudienceRoutes(app: FastifyInstance) {
  /** Who follows this club: aggregate cohorts, as the platform reports them. */
  app.get("/", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const [audience, trend] = await Promise.all([latestAudience(user.orgId), audienceTrend(user.orgId, 12)]);
    if (!audience) return reply.code(404).send({ error: "No audience data for this club yet." });

    return {
      capturedAt: audience.capturedAt.toISOString(),
      followers: audience.followers,
      reach28d: audience.reach28d,
      breakdowns: {
        country: audience.country,
        city: audience.city,
        age: audience.age,
        gender: audience.gender,
      },
      trend,
      note: "Aggregate cohorts only. Platforms do not expose individual followers.",
    };
  });

  /** Sponsor exposure split by market, re-priced with each market's CPM index. */
  app.get("/markets", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const query = request.query as { days?: string; sponsorId?: string };

    const result = await valueByMarket(user.orgId, {
      days: Number(query.days ?? 90),
      sponsorId: query.sponsorId,
    });
    if (!result) return reply.code(404).send({ error: "No audience data for this club yet." });
    return result;
  });
}
