/**
 * The analyst agent.
 *
 * The model runs against the MCP tools in ../mcp/server.ts and nothing else: no database
 * handle, no SQL, and no tool that takes a club id. It reaches them over this API's own
 * /mcp endpoint with a token minted from the signed-in session, so a question can only
 * ever be answered about the asker's own club.
 *
 * Today the loop is the `claude` command, which uses the sign-in on this machine and
 * needs no API key. Swapping it for the Anthropic SDK's tool runner later changes this
 * file alone — the tools, the prompt and the guardrails stay where they are.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mintMcpToken } from "../mcp/token.js";

const TIMEOUT_MS = 180_000;

/** Claude Code's built-ins, switched off. ToolSearch stays: it is how the MCP tools load. */
const DISALLOWED_TOOLS = [
  "Bash",
  "BashOutput",
  "KillShell",
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
  "Agent",
  "TodoWrite",
  "SlashCommand",
];

const SYSTEM_PROMPT = `You are the sponsorship analyst for a sports rights holder, working inside their measurement platform.

Answer with the horizm tools. Never state a number you did not read from a tool, and never guess at one that a tool could give you. If a tool returns an error, say what you could not find rather than working around it.

How to answer:
- Lead with the answer in one sentence, then at most four short supporting lines. One compact markdown table is allowed when comparing sponsors, weeks or markets; never more than one.
- No headings. Money is pounds, written as £4,120, not 4120.34.
- When something moved, name the cause you can see in the data (fewer posts, a board rotation, a weaker placement mix, lower impressions) and say plainly when the data cannot tell you why.
- Never name another club. Benchmarks are anonymised by design; report position, median and percentile only.
- Audience data is aggregate cohorts, never individual people. Do not imply otherwise.
- No preamble, no restating the question. Never end with an offer of further help or a question back.
- "Where is our exposure landing" is about money: use get_market_value, which prices each market, not audience share alone.

The horizm tools may be listed as deferred. If you cannot see them, load them first with ToolSearch using the query "select:mcp__horizm__get_club,mcp__horizm__get_summary,mcp__horizm__list_sponsors,mcp__horizm__get_sponsor,mcp__horizm__list_posts,mcp__horizm__get_audience,mcp__horizm__get_market_value,mcp__horizm__get_benchmarks", then answer. Never tell the user about tooling problems unless every tool genuinely fails.`;

export type AgentEvent =
  | { type: "tool"; name: string; input: unknown }
  | { type: "text"; text: string }
  | { type: "done"; text: string; ms: number; sessionId: string | null }
  | { type: "error"; message: string };

/** Claude Code on Windows needs Git Bash; find it next to git when it isn't configured. */
function claudeEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  if (process.platform === "win32" && !env.CLAUDE_CODE_GIT_BASH_PATH) {
    const candidates = [
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Git", "bin", "bash.exe"),
      "C:\\Program Files\\Git\\bin\\bash.exe",
    ];
    const found = candidates.find((candidate) => candidate && existsSync(candidate));
    if (found) env.CLAUDE_CODE_GIT_BASH_PATH = found;
  }
  return env;
}

/**
 * MCP config pointing at this API's own /mcp endpoint, with a short-lived token that
 * scopes the session to one club. Over HTTP the server is already running, so the tools
 * are there the moment the model asks — a spawned stdio server was still connecting when
 * the first question arrived, and the model answered without them.
 */
async function writeMcpConfig(dir: string, orgId: string) {
  const configPath = path.join(dir, "mcp.json");
  await writeFile(
    configPath,
    JSON.stringify({
      mcpServers: {
        horizm: {
          type: "http",
          url: `http://127.0.0.1:${process.env.PORT ?? 4000}/mcp`,
          headers: { "x-horizm-token": mintMcpToken(orgId, 10 * 60 * 1000) },
        },
      },
    }),
  );
  return configPath;
}

/**
 * Runs one question and yields events as they happen: which tool the model reached for,
 * the answer text, then a final event with timing.
 */
export async function* ask(
  question: string,
  orgId: string,
  resumeSessionId?: string,
): AsyncGenerator<AgentEvent> {
  const started = Date.now();
  const workdir = await mkdtemp(path.join(tmpdir(), "horizm-agent-"));
  const queue: AgentEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let finished = false;

  const push = (event: AgentEvent) => {
    queue.push(event);
    resolveNext?.();
    resolveNext = null;
  };

  try {
    const configPath = await writeMcpConfig(workdir, orgId);
    const child = spawn(
      "claude",
      [
        "-p",
        // Sonnet answers these in half the time and reads small JSON just as well.
        // Set HORIZM_AGENT_MODEL to change it.
        "--model",
        process.env.HORIZM_AGENT_MODEL ?? "sonnet",
        "--output-format",
        "stream-json",
        "--verbose",
        "--mcp-config",
        configPath,
        "--strict-mcp-config",
        "--allowedTools",
        "mcp__horizm,ToolSearch",
        // The analyst gets the platform's tools and nothing else: no shell, no files,
        // no web. Without this it wanders off reading the source code it is running on.
        "--disallowedTools",
        DISALLOWED_TOOLS.join(","),
        "--max-turns",
        "14",
        "--append-system-prompt",
        SYSTEM_PROMPT,
        // Continuing a conversation: the model keeps what it already read, so a
        // follow-up costs one round instead of repeating every tool call.
        ...(resumeSessionId ? ["--resume", resumeSessionId] : []),
      ],
      { cwd: workdir, env: claudeEnv({}), shell: process.platform === "win32" },
    );

    const timer = setTimeout(() => {
      child.kill();
      push({ type: "error", message: "The analyst took too long. Ask something narrower." });
      finished = true;
    }, TIMEOUT_MS);

    let answer = "";
    let buffer = "";
    let stderr = "";
    let sessionId: string | null = resumeSessionId ?? null;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        let event: {
          type?: string;
          session_id?: string;
          message?: { content?: { type: string; name?: string; input?: unknown; text?: string }[] };
          result?: string;
          is_error?: boolean;
        };
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }

        if (event.session_id) sessionId = event.session_id;

        if (event.type === "assistant" && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === "tool_use" && block.name) {
              push({ type: "tool", name: block.name.replace("mcp__horizm__", ""), input: block.input });
            }
            if (block.type === "text" && block.text?.trim()) {
              answer = block.text;
              push({ type: "text", text: block.text });
            }
          }
        }

        if (event.type === "result") {
          if (event.is_error) {
            push({ type: "error", message: String(event.result ?? "The analyst failed.").slice(0, 300) });
          } else {
            const text = typeof event.result === "string" && event.result.trim() ? event.result : answer;
            push({ type: "done", text, ms: Date.now() - started, sessionId });
          }
          finished = true;
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));

    child.on("error", () => {
      push({ type: "error", message: "Claude Code isn't available on this machine." });
      finished = true;
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (!finished) {
        push({ type: "error", message: stderr.trim().slice(-200) || "The analyst stopped without answering." });
        finished = true;
      }
      resolveNext?.();
    });

    child.stdin.write(question);
    child.stdin.end();

    while (true) {
      while (queue.length) {
        const event = queue.shift()!;
        yield event;
        if (event.type === "done" || event.type === "error") return;
      }
      if (finished && !queue.length) return;
      await new Promise<void>((resolve) => (resolveNext = resolve));
    }
  } finally {
    // The MCP child may still be releasing the directory; a leftover temp folder is not
    // worth failing an answered question over.
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  }
}
