/**
 * Pilot data.
 *
 * Clubs are real. Everything commercial is invented: the sponsors, the deals, the
 * engagement figures and the images. Nothing here was scraped from a club's accounts,
 * and no figure in this file describes a real sponsorship.
 *
 *   npm run seed            reseed from scratch (wipes the database)
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLACEMENT_KEYS } from "@horizm/contracts";
import { db } from "../db.js";
import { hashPassword } from "../auth.js";
import { drawScene, ensureFonts, SCENE_HEIGHT, SCENE_WIDTH, type SceneSponsor } from "./scene.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.resolve(here, "..", "..", "media");

const DEMO_PASSWORD = "pilot1234";
const POSTS_PER_CLUB = 40;
const WINDOW_DAYS = 120;

/** Invented sponsors. Any resemblance to a real deal is coincidental. */
const SPONSORS = [
  { slug: "northwind-bank", name: "Northwind Bank", category: "Financial services" },
  { slug: "volta-energy", name: "Volta Energy", category: "Energy" },
  { slug: "kestrel-insurance", name: "Kestrel Insurance", category: "Insurance" },
  { slug: "harbor-air", name: "Harbor Air", category: "Travel" },
  { slug: "mera-foods", name: "Mera Foods", category: "Food and drink" },
  { slug: "trailhead", name: "Trailhead", category: "Apparel" },
  { slug: "pennine-logistics", name: "Pennine Logistics", category: "Logistics" },
  { slug: "cobalt-telecom", name: "Cobalt Telecom", category: "Telecoms" },
  { slug: "redwood-motors", name: "Redwood Motors", category: "Automotive" },
  { slug: "silverline", name: "Silverline Utilities", category: "Utilities" },
];

const CLUBS = [
  {
    slug: "bristol-city",
    name: "Bristol City Football Club",
    shortName: "Bristol City",
    stadium: "Ashton Gate",
    handle: "bristolcityfc",
    primaryColor: "#C8102E",
    accentColor: "#1B1B1B",
    shirtColor: "#C8102E",
    shortsColor: "#FFFFFF",
    followers: 420_000,
    shirtSponsor: "northwind-bank",
    boardSponsors: ["volta-energy", "kestrel-insurance", "mera-foods"],
    overlaySponsor: "harbor-air",
  },
  {
    slug: "birmingham-city",
    name: "Birmingham City Football Club",
    shortName: "Birmingham City",
    stadium: "St Andrew's",
    handle: "bcfc",
    primaryColor: "#1B3A8F",
    accentColor: "#FFFFFF",
    shirtColor: "#1B3A8F",
    shortsColor: "#FFFFFF",
    followers: 610_000,
    shirtSponsor: "cobalt-telecom",
    boardSponsors: ["northwind-bank", "trailhead", "silverline"],
    overlaySponsor: "volta-energy",
  },
  {
    slug: "coventry-city",
    name: "Coventry City Football Club",
    shortName: "Coventry City",
    stadium: "Coventry Building Society Arena",
    handle: "coventrycity",
    primaryColor: "#2E5FA3",
    accentColor: "#0B2545",
    shirtColor: "#2E5FA3",
    shortsColor: "#0B2545",
    followers: 330_000,
    shirtSponsor: "redwood-motors",
    boardSponsors: ["pennine-logistics", "volta-energy", "kestrel-insurance"],
    overlaySponsor: "mera-foods",
  },
  {
    slug: "derby-county",
    name: "Derby County Football Club",
    shortName: "Derby County",
    stadium: "Pride Park",
    handle: "dcfcofficial",
    primaryColor: "#10233F",
    accentColor: "#C4C4C4",
    shirtColor: "#10233F",
    shortsColor: "#FFFFFF",
    followers: 480_000,
    shirtSponsor: "silverline",
    boardSponsors: ["mera-foods", "cobalt-telecom", "harbor-air"],
    overlaySponsor: "trailhead",
  },
  {
    slug: "hull-city",
    name: "Hull City Football Club",
    shortName: "Hull City",
    stadium: "MKM Stadium",
    handle: "hullcity",
    primaryColor: "#C4711A",
    accentColor: "#111111",
    shirtColor: "#B4611A",
    shortsColor: "#111111",
    followers: 290_000,
    shirtSponsor: "pennine-logistics",
    boardSponsors: ["redwood-motors", "northwind-bank", "trailhead"],
    overlaySponsor: "kestrel-insurance",
  },
] as const;

const CAPTIONS = [
  "Full time at {stadium}.",
  "Matchday. {stadium} is filling up.",
  "Second half under way.",
  "Three points on the board.",
  "That feeling at the final whistle.",
  "Warm-ups done. Team news shortly.",
  "A point earned in front of our own.",
  "Back in front of you next weekend.",
  "Behind the scenes before kick-off.",
  "Your player of the match.",
];

/** Rate card, in pounds per thousand impressions, by placement. */
const RATE_CARD: Record<string, number> = {
  shirt_front: 16,
  broadcast_overlay: 12,
  backdrop: 11,
  perimeter_board: 10,
  kit_other: 7.5,
  signage: 7,
  equipment: 6.5,
  other: 6,
};

function rng(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

async function main() {
  ensureFonts();

  console.log("Clearing the database…");
  await db.detection.deleteMany();
  await db.post.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.rateCard.deleteMany();
  await db.socialAccount.deleteMany();
  await db.sponsor.deleteMany();
  await db.org.deleteMany();

  await rm(path.join(MEDIA_DIR, "posts"), { recursive: true, force: true });
  await mkdir(path.join(MEDIA_DIR, "posts"), { recursive: true });
  await mkdir(path.join(MEDIA_DIR, "uploads"), { recursive: true });

  console.log("Creating sponsors…");
  const sponsorsBySlug = new Map<string, { id: string; name: string; slug: string }>();
  for (const sponsor of SPONSORS) {
    const created = await db.sponsor.create({ data: sponsor });
    sponsorsBySlug.set(created.slug, created);
  }

  for (const [clubIndex, club] of CLUBS.entries()) {
    console.log(`Creating ${club.shortName}…`);
    const org = await db.org.create({
      data: {
        slug: club.slug,
        name: club.name,
        shortName: club.shortName,
        sport: "Football",
        division: "Championship",
        primaryColor: club.primaryColor,
        accentColor: club.accentColor,
        users: {
          create: {
            email: `${club.slug}@horizm.test`,
            name: `${club.shortName} Commercial`,
            passwordHash: hashPassword(DEMO_PASSWORD),
            role: "admin",
          },
        },
        socialAccounts: {
          create: { platform: "instagram", handle: club.handle, connectedAt: null, demo: true },
        },
        rateCards: {
          create: PLACEMENT_KEYS.map((placement) => ({ placement, cpm: RATE_CARD[placement] })),
        },
      },
    });

    const asSceneSponsor = (slug: string): SceneSponsor => {
      const sponsor = sponsorsBySlug.get(slug)!;
      return { name: sponsor.name, slug: sponsor.slug };
    };

    const random = rng(1000 + clubIndex * 37);

    for (let i = 0; i < POSTS_PER_CLUB; i++) {
      // Boards rotate between matches, the way a real LED cycle would.
      const rotation = [...club.boardSponsors];
      const offset = i % rotation.length;
      const boards = [...rotation.slice(offset), ...rotation.slice(0, offset)].slice(0, 3);
      const night = random() > 0.55;

      const scene = drawScene({
        seed: clubIndex * 10_000 + i * 17 + 3,
        shirtColor: club.shirtColor,
        shortsColor: club.shortsColor,
        accentColor: club.accentColor,
        shirtSponsor: asSceneSponsor(club.shirtSponsor),
        boardSponsors: boards.map(asSceneSponsor),
        overlaySponsor: i % 3 === 0 ? asSceneSponsor(club.overlaySponsor) : undefined,
        night,
      });

      const daysAgo = Math.round((i / POSTS_PER_CLUB) * WINDOW_DAYS + random() * 2);
      const postedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      const filename = `posts/${club.slug}-${String(i).padStart(3, "0")}.png`;
      await writeFile(path.join(MEDIA_DIR, filename), scene.png);

      // Engagement scales with the club's following, with matchday spikes.
      const matchday = i % 4 === 0;
      const reach = Math.round(club.followers * (0.35 + random() * 0.3) * (matchday ? 1.6 : 1));
      const impressions = Math.round(reach * (1.2 + random() * 0.5));

      await db.post.create({
        data: {
          orgId: org.id,
          externalId: `${club.slug}_seed_${i}`,
          platform: "instagram",
          caption: CAPTIONS[i % CAPTIONS.length].replace("{stadium}", club.stadium),
          postedAt,
          imagePath: filename,
          width: SCENE_WIDTH,
          height: SCENE_HEIGHT,
          impressions,
          reach,
          likes: Math.round(reach * (0.04 + random() * 0.03)),
          comments: Math.round(reach * (0.002 + random() * 0.002)),
          scene: `${night ? "Evening" : "Afternoon"} matchday frame at ${club.stadium}.`,
          analyzedAt: postedAt,
          source: "seed",
          detections: {
            create: scene.detections.map((d) => ({
              sponsorId: sponsorsBySlug.get(d.slug)!.id,
              placement: d.placement,
              location: d.location,
              x: d.x,
              y: d.y,
              sizePct: d.size_pct,
              clarity: d.clarity,
              obstruction: d.obstruction,
              confidence: d.confidence,
            })),
          },
        },
      });
    }
  }

  const [orgs, posts, detections] = await Promise.all([db.org.count(), db.post.count(), db.detection.count()]);
  console.log(`\nDone: ${orgs} clubs, ${posts} posts, ${detections} detections.`);
  console.log(`Sign in with <club-slug>@horizm.test / ${DEMO_PASSWORD}`);
  console.log(`e.g. bristol-city@horizm.test`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
