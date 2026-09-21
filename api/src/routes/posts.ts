import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth.js";
import { db } from "../db.js";
import { cpmLookup, postsForOrg } from "../queries.js";
import { detectionQuality, postValue } from "../scoring.js";
import { AnalysisError, analyzeImage } from "../analyze.js";
import { MEDIA_DIR } from "../paths.js";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function registerPostRoutes(app: FastifyInstance) {
  /** Recent posts for the signed-in club, newest first. */
  app.get("/posts", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const query = request.query as { days?: string; limit?: string };
    const days = Number(query.days ?? 120);
    const limit = Math.min(Number(query.limit ?? 24), 100);

    const [posts, cpmFor] = await Promise.all([postsForOrg(user.orgId, days), cpmLookup(user.orgId)]);

    return {
      posts: posts.slice(0, limit).map((post) => ({
        id: post.id,
        caption: post.caption,
        postedAt: post.postedAt.toISOString(),
        imageUrl: `/media/${post.imagePath}`,
        impressions: post.impressions,
        likes: post.likes,
        comments: post.comments,
        detectionCount: post.detections.filter((d) => d.counted).length,
        value: postValue(post, cpmFor),
      })),
    };
  });

  /** One post with every detection, for the pinned image view. */
  app.get("/posts/:id", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };

    const post = await db.post.findFirst({
      where: { id, orgId: user.orgId },
      include: { detections: { include: { sponsor: true } } },
    });
    if (!post) return reply.code(404).send({ error: "No such post." });

    const cpmFor = await cpmLookup(user.orgId);
    const rows = post.detections.map((d) => ({
      id: d.id,
      sponsorId: d.sponsorId,
      sponsorName: d.sponsor.name,
      placement: d.placement,
      sizePct: d.sizePct,
      clarity: d.clarity,
      obstruction: d.obstruction,
      counted: d.counted,
    }));

    return {
      post: {
        id: post.id,
        caption: post.caption,
        postedAt: post.postedAt.toISOString(),
        imageUrl: `/media/${post.imagePath}`,
        width: post.width,
        height: post.height,
        impressions: post.impressions,
        reach: post.reach,
        likes: post.likes,
        comments: post.comments,
        scene: post.scene,
        source: post.source,
        value: postValue({ id: post.id, impressions: post.impressions, detections: rows }, cpmFor),
      },
      detections: post.detections.map((d) => ({
        id: d.id,
        sponsorId: d.sponsorId,
        sponsorName: d.sponsor.name,
        placement: d.placement,
        location: d.location,
        x: d.x,
        y: d.y,
        size_pct: d.sizePct,
        clarity: d.clarity,
        obstruction: d.obstruction,
        confidence: d.confidence,
        counted: d.counted,
        quality: detectionQuality({
          id: d.id,
          sponsorId: d.sponsorId,
          sponsorName: d.sponsor.name,
          placement: d.placement,
          sizePct: d.sizePct,
          clarity: d.clarity,
          obstruction: d.obstruction,
          counted: d.counted,
        }),
      })),
    };
  });

  /** Drop a wrong detection out of the totals, or put it back. */
  app.patch("/detections/:id", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const parsed = z.object({ counted: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Send { counted: true } or { counted: false }." });

    // Scoped through the post so one club can't edit another's data.
    const detection = await db.detection.findFirst({ where: { id, post: { orgId: user.orgId } } });
    if (!detection) return reply.code(404).send({ error: "No such detection." });

    await db.detection.update({ where: { id }, data: { counted: parsed.data.counted } });
    return { id, counted: parsed.data.counted };
  });

  /**
   * The live moment: upload a real image, run the vision model, store it as a post.
   * Everything else in the pilot is seeded; this is not.
   */
  app.post("/analyze", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "Attach an image." });
    const extension = EXTENSIONS[file.mimetype];
    if (!extension) return reply.code(400).send({ error: "Use a JPEG, PNG, WebP or GIF image." });

    const bytes = await file.toBuffer();

    let analysis;
    try {
      analysis = await analyzeImage(bytes, extension);
    } catch (error) {
      const message = error instanceof AnalysisError ? error.message : "The analysis failed. Try again.";
      request.log.error({ err: error }, "analysis failed");
      return reply.code(502).send({ error: message });
    }

    const filename = `uploads/${randomUUID()}${extension}`;
    await writeFile(path.join(MEDIA_DIR, filename), bytes);

    const post = await db.post.create({
      data: {
        orgId: user.orgId,
        externalId: `upload_${randomUUID()}`,
        platform: "upload",
        caption: file.filename ?? "Uploaded image",
        postedAt: new Date(),
        imagePath: filename,
        width: 0,
        height: 0,
        impressions: 250_000,
        reach: 180_000,
        likes: 0,
        comments: 0,
        scene: analysis.scene,
        analyzedAt: new Date(),
        source: "upload",
        detections: {
          create: await Promise.all(
            analysis.detections.map(async (d) => ({
              sponsorId: (await upsertSponsor(d.brand)).id,
              placement: d.placement,
              location: d.location,
              x: d.x,
              y: d.y,
              sizePct: d.size_pct,
              clarity: d.clarity,
              obstruction: d.obstruction,
              confidence: d.confidence,
            })),
          ),
        },
      },
    });

    return { postId: post.id, scene: analysis.scene, detections: analysis.detections.length };
  });
}

/** Sponsors are shared across clubs, so the same brand lines up in the marketplace. */
async function upsertSponsor(brand: string) {
  const slug = brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
  return db.sponsor.upsert({
    where: { slug },
    update: {},
    create: { slug, name: brand.trim(), category: "uncategorised" },
  });
}
