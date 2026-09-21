/**
 * The platform's tools, as an MCP server.
 *
 * This is the only way an agent reaches club data. There is no SQL tool and no tool
 * takes an org id: the club is fixed when the server is created, from the signed-in
 * session or a scoped token, so an agent cannot ask about another club. The marketplace
 * tool returns the same anonymised shape the HTTP endpoint does.
 *
 * One factory, two transports: HTTP (served by this API at /mcp, always warm) and stdio
 * (src/mcp/stdio.ts, for clients that spawn a process).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db.js";
import { audienceTrend, latestAudience, valueByMarket } from "../audience.js";
import { cpmLookup, postsForOrg, weeklyBuckets } from "../queries.js";
import { detectionQuality, percentileOf, postValue, quantile, sponsorRows } from "../scoring.js";

/** Tools answer with compact JSON; the model reads it, the numbers stay exact. */
const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const round = (value: number, places = 2) => Number(value.toFixed(places));

/** Every tool below closes over this one club. */
export function createHorizmServer(orgId: string) {
const server = new McpServer({ name: "horizm", version: "0.1.0" });

server.registerTool(
  "get_club",
  {
    title: "Club profile",
    description:
      "The club this session is scoped to: name, sport, division, its rate card (pounds per thousand impressions by placement) and connected social accounts.",
    inputSchema: {},
  },
  async () => {
    const org = await db.org.findUniqueOrThrow({
      where: { id: orgId },
      include: { rateCards: true, socialAccounts: true },
    });
    return json({
      name: org.name,
      sport: org.sport,
      division: org.division,
      rateCard: org.rateCards.map((card) => ({ placement: card.placement, cpm: card.cpm })),
      socialAccounts: org.socialAccounts.map((account) => ({
        platform: account.platform,
        handle: account.handle,
        connected: Boolean(account.connectedAt),
      })),
    });
  },
);

server.registerTool(
  "get_summary",
  {
    title: "Exposure summary",
    description:
      "Headline sponsor exposure for a period: posts, impressions, counted logo appearances, total media value in pounds, and the value week by week. Start here for 'how are we doing' questions.",
    inputSchema: { days: z.number().int().min(7).max(365).default(90) },
  },
  async ({ days }) => {
    const [posts, cpmFor] = await Promise.all([postsForOrg(orgId, days), cpmLookup(orgId)]);
    const rows = sponsorRows(posts, cpmFor);
    const trend = weeklyBuckets(days).map((bucket) => {
      const inWeek = posts.filter((post) => post.postedAt >= bucket.start && post.postedAt < bucket.end);
      return {
        week: bucket.label,
        posts: inWeek.length,
        value: round(inWeek.reduce((sum, post) => sum + postValue(post, cpmFor), 0)),
      };
    });

    return json({
      days,
      posts: posts.length,
      impressions: posts.reduce((sum, post) => sum + post.impressions, 0),
      appearances: posts.reduce((sum, post) => sum + post.detections.filter((d) => d.counted).length, 0),
      sponsors: rows.length,
      valueGbp: round(rows.reduce((sum, row) => sum + row.value, 0)),
      weekly: trend,
    });
  },
);

server.registerTool(
  "list_sponsors",
  {
    title: "Sponsors",
    description:
      "Every sponsor found in the club's posts for a period, with appearances, average logo quality (0-1) and media value in pounds, best first.",
    inputSchema: { days: z.number().int().min(7).max(365).default(90) },
  },
  async ({ days }) => {
    const [posts, cpmFor] = await Promise.all([postsForOrg(orgId, days), cpmLookup(orgId)]);
    return json({
      days,
      sponsors: sponsorRows(posts, cpmFor).map((row) => ({
        sponsorId: row.sponsorId,
        name: row.name,
        appearances: row.appearances,
        averageQuality: round(row.exposure),
        valueGbp: round(row.value),
      })),
    });
  },
);

server.registerTool(
  "get_sponsor",
  {
    title: "Sponsor detail",
    description:
      "One sponsor by name: where its logos appear (placement mix), its week-by-week value, and its best and worst posts. Use it to explain why a sponsor is up or down.",
    inputSchema: {
      name: z.string().describe("Sponsor name, e.g. 'Kestrel Insurance'. Matched loosely."),
      days: z.number().int().min(7).max(365).default(90),
    },
  },
  async ({ name, days }) => {
    const [posts, cpmFor] = await Promise.all([postsForOrg(orgId, days), cpmLookup(orgId)]);
    const needle = name.trim().toLowerCase();
    const match = posts
      .flatMap((post) => post.detections)
      .find((d) => d.sponsorName.toLowerCase().includes(needle));
    if (!match) return json({ error: `No sponsor matching "${name}" in the last ${days} days.` });

    const theirs = posts
      .map((post) => ({ ...post, detections: post.detections.filter((d) => d.sponsorId === match.sponsorId) }))
      .filter((post) => post.detections.length);

    const byPlacement = new Map<string, { appearances: number; quality: number }>();
    for (const post of theirs) {
      for (const d of post.detections) {
        if (!d.counted) continue;
        const entry = byPlacement.get(d.placement) ?? { appearances: 0, quality: 0 };
        entry.appearances += 1;
        entry.quality += detectionQuality(d);
        byPlacement.set(d.placement, entry);
      }
    }

    const scored = theirs
      .map((post) => ({
        postId: post.id,
        caption: post.caption,
        postedAt: post.postedAt.toISOString().slice(0, 10),
        impressions: post.impressions,
        appearances: post.detections.filter((d) => d.counted).length,
        valueGbp: round(postValue(post, cpmFor)),
      }))
      .sort((a, b) => b.valueGbp - a.valueGbp);

    return json({
      sponsor: match.sponsorName,
      sponsorId: match.sponsorId,
      days,
      appearances: theirs.reduce((sum, post) => sum + post.detections.filter((d) => d.counted).length, 0),
      valueGbp: round(theirs.reduce((sum, post) => sum + postValue(post, cpmFor), 0)),
      placements: [...byPlacement.entries()].map(([placement, entry]) => ({
        placement,
        appearances: entry.appearances,
        averageQuality: round(entry.quality / entry.appearances),
      })),
      weekly: weeklyBuckets(days).map((bucket) => {
        const inWeek = theirs.filter((post) => post.postedAt >= bucket.start && post.postedAt < bucket.end);
        return {
          week: bucket.label,
          appearances: inWeek.reduce((sum, post) => sum + post.detections.filter((d) => d.counted).length, 0),
          valueGbp: round(inWeek.reduce((sum, post) => sum + postValue(post, cpmFor), 0)),
        };
      }),
      bestPosts: scored.slice(0, 3),
      worstPosts: scored.slice(-3).reverse(),
    });
  },
);

server.registerTool(
  "list_posts",
  {
    title: "Posts",
    description:
      "Recent posts with impressions, engagement, how many sponsor logos were found and what each post was worth. Use it to find the posts behind a change.",
    inputSchema: {
      days: z.number().int().min(1).max(365).default(30),
      limit: z.number().int().min(1).max(50).default(20),
    },
  },
  async ({ days, limit }) => {
    const [posts, cpmFor] = await Promise.all([postsForOrg(orgId, days), cpmLookup(orgId)]);
    return json({
      days,
      posts: posts.slice(0, limit).map((post) => ({
        postId: post.id,
        caption: post.caption,
        postedAt: post.postedAt.toISOString().slice(0, 10),
        impressions: post.impressions,
        likes: post.likes,
        comments: post.comments,
        appearances: post.detections.filter((d) => d.counted).length,
        sponsors: [...new Set(post.detections.filter((d) => d.counted).map((d) => d.sponsorName))],
        valueGbp: round(postValue(post, cpmFor)),
      })),
    });
  },
);

server.registerTool(
  "get_audience",
  {
    title: "Audience",
    description:
      "Who follows the club: total followers, 28-day reach, and the share by country, city, age band and gender, plus the follower trend. Aggregate cohorts only — individual followers are never available.",
    inputSchema: {},
  },
  async () => {
    const [audience, trend] = await Promise.all([latestAudience(orgId), audienceTrend(orgId, 12)]);
    if (!audience) return json({ error: "No audience data for this club." });
    const top = (rows: { key: string; label: string; share: number }[], count: number) =>
      rows.slice(0, count).map((row) => ({ key: row.key, label: row.label, share: round(row.share, 3) }));

    return json({
      capturedAt: audience.capturedAt.toISOString().slice(0, 10),
      followers: audience.followers,
      reach28d: audience.reach28d,
      country: top(audience.country, 8),
      city: top(audience.city, 6),
      age: top(audience.age, 7),
      gender: top(audience.gender, 3),
      followerTrend: trend.map((point) => ({ week: point.label, followers: point.followers })),
      note: "Aggregate cohorts, as social platforms report them.",
    });
  },
);

server.registerTool(
  "get_market_value",
  {
    title: "Value by market",
    description:
      "Splits media value across countries using the audience shares and each market's CPM index, for all sponsors or one named sponsor. Answers 'where is this exposure actually landing'.",
    inputSchema: {
      days: z.number().int().min(7).max(365).default(90),
      sponsorName: z.string().optional().describe("Optional sponsor name to narrow to."),
    },
  },
  async ({ days, sponsorName }) => {
    let sponsorId: string | undefined;
    if (sponsorName) {
      const posts = await postsForOrg(orgId, days);
      const needle = sponsorName.trim().toLowerCase();
      sponsorId = posts
        .flatMap((post) => post.detections)
        .find((d) => d.sponsorName.toLowerCase().includes(needle))?.sponsorId;
      if (!sponsorId) return json({ error: `No sponsor matching "${sponsorName}".` });
    }

    const result = await valueByMarket(orgId, { days, sponsorId });
    if (!result) return json({ error: "No audience data for this club." });

    return json({
      days,
      sponsor: sponsorName ?? "all sponsors",
      totalValueGbp: round(result.totals.value),
      markets: result.markets.map((market) => ({
        country: market.country,
        label: market.label,
        audienceShare: round(market.audienceShare, 3),
        cpmIndex: market.cpmIndex,
        impressions: market.impressions,
        valueGbp: round(market.value),
      })),
    });
  },
);

server.registerTool(
  "get_benchmarks",
  {
    title: "Cohort benchmarks",
    description:
      "How this club compares with others in its division: median, quartiles and percentile for value per post, impressions per post, logos per post and logo quality. Rival clubs are never named.",
    inputSchema: { days: z.number().int().min(7).max(365).default(90) },
  },
  async ({ days }) => {
    const org = await db.org.findUniqueOrThrow({ where: { id: orgId } });
    const others = await db.org.findMany({
      where: { sport: org.sport, division: org.division, id: { not: orgId } },
      select: { id: true },
    });

    const metricsFor = async (id: string) => {
      const [posts, cpmFor] = await Promise.all([postsForOrg(id, days), cpmLookup(id)]);
      if (!posts.length) return null;
      const counted = posts.flatMap((post) => post.detections.filter((d) => d.counted));
      return {
        valuePerPost: posts.reduce((sum, post) => sum + postValue(post, cpmFor), 0) / posts.length,
        impressionsPerPost: posts.reduce((sum, post) => sum + post.impressions, 0) / posts.length,
        logosPerPost: counted.length / posts.length,
        averageQuality: counted.length ? counted.reduce((sum, d) => sum + detectionQuality(d), 0) / counted.length : 0,
      };
    };

    const mine = await metricsFor(orgId);
    const cohort = (await Promise.all(others.map((other) => metricsFor(other.id)))).filter(
      (value): value is NonNullable<typeof value> => value !== null,
    );
    if (!mine || cohort.length < 2) return json({ error: "Cohort too small to report without identifying a club." });

    const metrics = ["valuePerPost", "impressionsPerPost", "logosPerPost", "averageQuality"] as const;
    return json({
      days,
      cohort: `${org.division}, ${org.sport}`,
      cohortSize: cohort.length + 1,
      benchmarks: metrics.map((metric) => {
        const values = cohort.map((entry) => entry[metric]).sort((a, b) => a - b);
        return {
          metric,
          yours: round(mine[metric]),
          median: round(quantile(values, 0.5)),
          p25: round(quantile(values, 0.25)),
          p75: round(quantile(values, 0.75)),
          percentile: percentileOf(mine[metric], values),
        };
      }),
      note: "Anonymised: no rival club is identified.",
    });
  },
);

  return server;
}
