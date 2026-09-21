/**
 * The vision step, behind one function.
 *
 * Today it shells out to Claude Code, which uses the sign-in already on this machine
 * and needs no API key. Swapping in the Anthropic SDK, or your own detector, means
 * replacing `analyzeImage` and nothing else: the rest of the system only knows the
 * schema it returns.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { analysisSchema, type Analysis } from "@horizm/contracts";

const TIMEOUT_MS = 240_000;

export const ANALYSIS_PROMPT = `You are measuring sponsor exposure in one sports media image (a match photo, broadcast frame or social post) for a sponsorship valuation report.

The image is the file \`IMAGE_NAME\` in the current directory. Read it with the Read tool. Do not use any other tool.

Find every visible brand logo or sponsor wordmark: kit sponsors, kit manufacturers, perimeter or LED boards, interview backdrops, on-screen broadcast graphics, stadium signage and branded equipment. Record each separate appearance as its own entry, even when the same brand appears more than once. Include logos that are partly hidden or cut off by the frame edge. Skip club crests, player names, shirt numbers, scores and any text that is not a commercial brand.

Reply with only a JSON object in this shape, and no other text:
{"scene": "one short sentence describing the image",
 "detections": [{
   "brand": "brand name as written",
   "placement": one of "shirt_front", "kit_other", "perimeter_board", "backdrop", "broadcast_overlay", "signage", "equipment", "other",
   "location": "a few words, e.g. LED board behind the goal",
   "x": number 0-1, horizontal centre of the logo (0 = left edge),
   "y": number 0-1, vertical centre of the logo (0 = top edge),
   "size_pct": percent of the whole image area the logo covers (a logo a tenth of the image wide and a twentieth tall is 0.5),
   "clarity": number 0-1, how legible the logo is given blur, angle and lighting,
   "obstruction": number 0-1, share of the logo hidden or cut off,
   "confidence": number 0-1, how sure you are of the brand
 }]}
If there are no brands, return an empty "detections" array.`;

export class AnalysisError extends Error {}

/** Claude Code on Windows needs Git Bash; find it next to git when it isn't configured. */
function claudeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (process.platform === "win32" && !env.CLAUDE_CODE_GIT_BASH_PATH) {
    const candidates = [
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Git", "bin", "bash.exe"),
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ];
    const found = candidates.find((candidate) => candidate && existsSync(candidate));
    if (found) env.CLAUDE_CODE_GIT_BASH_PATH = found;
  }
  return env;
}

/** Pull a JSON value out of a reply that may be wrapped in prose or a code fence. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const attempts = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) attempts.push(fence[1]);
  const starts = [trimmed.indexOf("{"), trimmed.indexOf("[")].filter((i) => i !== -1);
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (starts.length && end > Math.min(...starts)) attempts.push(trimmed.slice(Math.min(...starts), end + 1));
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // try the next shape
    }
  }
  return null;
}

function runClaude(cwd: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "-p",
        // Sonnet reads logos off a frame as well as anything and answers in a third of
        // the time. HORIZM_VISION_MODEL overrides it.
        "--model",
        process.env.HORIZM_VISION_MODEL ?? "sonnet",
        "--output-format",
        "json",
        "--allowedTools",
        "Read",
        "--strict-mcp-config",
      ],
      { cwd, env: claudeEnv(), shell: process.platform === "win32" },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new AnalysisError("Claude took too long to answer. Try again."));
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", () =>
      reject(new AnalysisError("Claude Code isn't installed, or the `claude` command isn't on PATH.")),
    );
    child.on("close", () => {
      clearTimeout(timer);
      if (!stdout.trim()) {
        reject(new AnalysisError(`Claude Code returned nothing. ${stderr.trim().slice(-300)}`));
        return;
      }
      resolve(stdout);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** Analyze image bytes and return detections that already match the shared schema. */
export async function analyzeImage(bytes: Buffer, extension: string): Promise<Analysis> {
  const workdir = await mkdtemp(path.join(tmpdir(), "horizm-"));
  const name = `image${extension}`;
  try {
    await writeFile(path.join(workdir, name), bytes);
    const raw = await runClaude(workdir, ANALYSIS_PROMPT.replace("IMAGE_NAME", name));

    const envelope = extractJson(raw) as { is_error?: boolean; result?: string; subtype?: string } | null;
    if (!envelope || typeof envelope.result !== "string") {
      throw new AnalysisError("Claude Code didn't return a result.");
    }
    if (envelope.is_error) {
      throw new AnalysisError(`Claude Code reported an error: ${String(envelope.result).slice(0, 200)}`);
    }

    const payload = extractJson(envelope.result);
    if (payload === null) throw new AnalysisError("The reply wasn't in the expected format. Try again.");
    return analysisSchema.parse(payload);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
