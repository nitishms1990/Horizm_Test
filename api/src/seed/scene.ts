/**
 * Synthetic matchday images.
 *
 * The pilot needs pictures that (a) nobody owns the rights to and (b) have a known
 * answer. Drawing them means we know exactly which logo sits where, how big it is and
 * what covers it, so the seeded detections are the truth rather than a guess. Real
 * uploads still go through the vision model.
 */
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import type { Placement } from "@horizm/contracts";

export const SCENE_WIDTH = 1280;
export const SCENE_HEIGHT = 720;

const FONT = "sans-serif";

export type SceneSponsor = { name: string; slug: string };

export type SceneSpec = {
  seed: number;
  shirtColor: string;
  shortsColor: string;
  accentColor: string;
  shirtSponsor: SceneSponsor;
  boardSponsors: SceneSponsor[];
  overlaySponsor?: SceneSponsor;
  night: boolean;
};

export type SceneDetection = {
  slug: string;
  brand: string;
  placement: Placement;
  location: string;
  x: number;
  y: number;
  size_pct: number;
  clarity: number;
  obstruction: number;
  confidence: number;
};

export type Scene = {
  png: Buffer;
  detections: SceneDetection[];
};

/** Small deterministic generator so a given seed always draws the same match. */
function rng(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

function roundedRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

const areaPct = (w: number, h: number) => (w * h) / (SCENE_WIDTH * SCENE_HEIGHT) * 100;

/** Shrink the type until the wordmark fits its board or shirt, the way real artwork is set. */
function fitFont(ctx: SKRSContext2D, text: string, maxWidth: number, maxSize: number): number {
  let size = maxSize;
  ctx.font = `700 ${size}px ${FONT}`;
  while (size > 10 && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `700 ${size}px ${FONT}`;
  }
  return size;
}

/** Model-like noise, so seeded rows don't look suspiciously exact. */
function jitter(random: () => number, value: number, spread: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value + (random() - 0.5) * spread));
}

export function drawScene(spec: SceneSpec): Scene {
  const random = rng(spec.seed);
  const canvas = createCanvas(SCENE_WIDTH, SCENE_HEIGHT);
  const ctx = canvas.getContext("2d");
  const detections: SceneDetection[] = [];

  // Stand and crowd
  const stand = ctx.createLinearGradient(0, 0, 0, 300);
  stand.addColorStop(0, spec.night ? "#0E141B" : "#1B222B");
  stand.addColorStop(1, spec.night ? "#1A2029" : "#2C3642");
  ctx.fillStyle = stand;
  ctx.fillRect(0, 0, SCENE_WIDTH, 300);

  const crowd = ["#8A3B3B", "#C9C2B5", "#3D5A80", "#E0E0E0", "#5A4A3A", "#2F2F2F", spec.shirtColor];
  for (let row = 0, y = 16; y < 292; row++, y += 13) {
    for (let x = row % 2 ? 13 : 6; x < SCENE_WIDTH; x += 14) {
      ctx.globalAlpha = 0.3 + random() * 0.45;
      ctx.fillStyle = crowd[Math.floor(random() * crowd.length)];
      ctx.beginPath();
      ctx.arc(x + random() * 3, y + random() * 3, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Pitch
  for (let i = 0, y = 370; y < SCENE_HEIGHT; i++) {
    const bandHeight = 30 + i * 14;
    ctx.fillStyle = i % 2 ? "#2A7234" : "#2F7D3A";
    ctx.fillRect(0, y, SCENE_WIDTH, bandHeight);
    y += bandHeight;
  }
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(0, 396, SCENE_WIDTH, 4);

  // Perimeter boards
  ctx.fillStyle = "#07090C";
  ctx.fillRect(0, 296, SCENE_WIDTH, 78);
  const boardWidth = SCENE_WIDTH / spec.boardSponsors.length;
  const boardPalette = ["#0E3B8C", "#B8860B", "#1F6F54", "#7A1F3D"];

  spec.boardSponsors.forEach((sponsor, index) => {
    const x = index * boardWidth;
    ctx.fillStyle = boardPalette[index % boardPalette.length];
    ctx.fillRect(x, 300, boardWidth - 4, 70);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let y = 302; y < 370; y += 4) ctx.fillRect(x, y, boardWidth - 4, 1);

    const label = sponsor.name.toUpperCase();
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const fontSize = fitFont(ctx, label, boardWidth - 40, 46);
    const metrics = ctx.measureText(label);
    ctx.fillText(label, x + (boardWidth - 4) / 2, 337);

    detections.push({
      slug: sponsor.slug,
      brand: sponsor.name,
      placement: "perimeter_board",
      location: index === 0 ? "LED board, left of frame" : index === spec.boardSponsors.length - 1 ? "LED board, right of frame" : "LED board, centre",
      x: (x + (boardWidth - 4) / 2) / SCENE_WIDTH,
      y: 337 / SCENE_HEIGHT,
      size_pct: Number(areaPct(metrics.width, fontSize).toFixed(2)),
      clarity: Number(jitter(random, 0.92, 0.12, 0.55, 0.99).toFixed(2)),
      obstruction: 0,
      confidence: Number(jitter(random, 0.93, 0.1, 0.6, 0.99).toFixed(2)),
    });
  });

  // Player, drawn over the boards so one of them is partly hidden
  const playerX = 260 + Math.floor(random() * (SCENE_WIDTH - 520));
  drawPlayer(ctx, playerX, spec);

  const shirtLabel = spec.shirtSponsor.name.toUpperCase();
  const shirtFontSize = fitFont(ctx, shirtLabel, 120, 26);
  const shirtMetrics = ctx.measureText(shirtLabel);
  detections.push({
    slug: spec.shirtSponsor.slug,
    brand: spec.shirtSponsor.name,
    placement: "shirt_front",
    location: "Front of the player's shirt",
    x: playerX / SCENE_WIDTH,
    y: 452 / SCENE_HEIGHT,
    size_pct: Number(areaPct(shirtMetrics.width, shirtFontSize).toFixed(2)),
    clarity: Number(jitter(random, 0.88, 0.16, 0.5, 0.99).toFixed(2)),
    obstruction: 0,
    confidence: Number(jitter(random, 0.9, 0.12, 0.55, 0.99).toFixed(2)),
  });

  // The board behind the player loses part of its wordmark.
  const hiddenBoard = detections.find(
    (d) => d.placement === "perimeter_board" && Math.abs(d.x * SCENE_WIDTH - playerX) < boardWidth / 2,
  );
  if (hiddenBoard) {
    hiddenBoard.obstruction = Number(jitter(random, 0.3, 0.2, 0.1, 0.55).toFixed(2));
    hiddenBoard.clarity = Number(Math.min(hiddenBoard.clarity, jitter(random, 0.78, 0.12, 0.5, 0.9)).toFixed(2));
    hiddenBoard.location = "LED board, partly behind the player";
  }

  // Broadcast scorebug
  if (spec.overlaySponsor) {
    ctx.fillStyle = "rgba(8,12,16,0.9)";
    roundedRect(ctx, 32, 32, 300, 50, 6);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText("HOME  1-0  AWAY", 48, 58);

    ctx.fillStyle = "#FFFFFF";
    roundedRect(ctx, 32, 86, 210, 32, 4);
    ctx.fillStyle = "#6B7280";
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText("TIMED BY", 44, 103);
    const overlayLabel = spec.overlaySponsor.name.toUpperCase();
    ctx.fillStyle = "#0E3B8C";
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(overlayLabel, 112, 103);
    const overlayMetrics = ctx.measureText(overlayLabel);

    detections.push({
      slug: spec.overlaySponsor.slug,
      brand: spec.overlaySponsor.name,
      placement: "broadcast_overlay",
      location: "Timing tab under the scorebug",
      x: (112 + overlayMetrics.width / 2) / SCENE_WIDTH,
      y: 103 / SCENE_HEIGHT,
      size_pct: Number(areaPct(overlayMetrics.width, 20).toFixed(2)),
      clarity: Number(jitter(random, 0.9, 0.1, 0.6, 0.99).toFixed(2)),
      obstruction: 0,
      confidence: Number(jitter(random, 0.92, 0.1, 0.6, 0.99).toFixed(2)),
    });
  }

  return { png: canvas.toBuffer("image/png"), detections };
}

function drawPlayer(ctx: SKRSContext2D, cx: number, spec: SceneSpec) {
  const skin = "#B9825F";
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 40, 606, 26, 50);
  ctx.fillRect(cx + 14, 606, 26, 50);
  ctx.fillStyle = spec.accentColor;
  ctx.fillRect(cx - 42, 640, 30, 50);
  ctx.fillRect(cx + 12, 640, 30, 50);
  ctx.fillStyle = "#111111";
  roundedRect(ctx, cx - 48, 686, 38, 16, 4);
  roundedRect(ctx, cx + 10, 686, 38, 16, 4);
  ctx.fillStyle = spec.shortsColor;
  roundedRect(ctx, cx - 60, 536, 120, 80, 8);
  ctx.fillStyle = skin;
  roundedRect(ctx, cx - 94, 440, 30, 100, 12);
  roundedRect(ctx, cx + 64, 440, 30, 100, 12);
  ctx.fillStyle = spec.shirtColor;
  roundedRect(ctx, cx - 98, 384, 42, 70, 10);
  roundedRect(ctx, cx + 56, 384, 42, 70, 10);
  roundedRect(ctx, cx - 66, 378, 132, 172, 14);
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 12, 350, 24, 34);
  ctx.beginPath();
  ctx.arc(cx, 330, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2A1D14";
  ctx.beginPath();
  ctx.arc(cx, 326, 33, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(cx - 18, 378, 36, 5);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = spec.shirtSponsor.name.toUpperCase();
  fitFont(ctx, label, 120, 26);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(label, cx, 452);
}

/** Keeps @napi-rs/canvas quiet about missing fonts on a bare machine. */
export function ensureFonts() {
  try {
    GlobalFonts.registerFromPath?.("C:\\Windows\\Fonts\\arial.ttf", "sans-serif");
  } catch {
    // The bundled fallback is fine.
  }
}
