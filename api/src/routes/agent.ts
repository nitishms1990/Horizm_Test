import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import { db } from "../db.js";
import { ask } from "../agent/runner.js";

const MAX_QUESTION = 400;

export async function registerAgentRoutes(app: FastifyInstance) {
  /**
   * Streams one question's answer as server-sent events, so the browser can show which
   * tool the analyst reached for while it works.
   */
  app.get("/ask", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const question = String((request.query as { q?: string }).q ?? "").trim();
    if (!question) return reply.code(400).send({ error: "Ask a question." });
    if (question.length > MAX_QUESTION) {
      return reply.code(400).send({ error: `Keep the question under ${MAX_QUESTION} characters.` });
    }

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });

    const send = (event: unknown) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    const toolsUsed: string[] = [];
    let answer = "";
    let failure: string | null = null;
    const started = Date.now();

    try {
      for await (const event of ask(question, user.orgId)) {
        if (event.type === "tool") toolsUsed.push(event.name);
        if (event.type === "done") answer = event.text;
        if (event.type === "error") failure = event.message;
        send(event);
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : "The analyst failed.";
      send({ type: "error", message: failure });
    } finally {
      // Every run is recorded: what was asked, which tools ran, what came back.
      await db.agentRun
        .create({
          data: {
            orgId: user.orgId,
            userId: user.id,
            question,
            answer,
            toolsUsed: JSON.stringify(toolsUsed),
            durationMs: Date.now() - started,
            error: failure,
          },
        })
        .catch((error) => request.log.error({ err: error }, "could not record agent run"));

      reply.raw.end();
    }
  });

  /** The club's own history of questions, newest first. */
  app.get("/runs", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const runs = await db.agentRun.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return {
      runs: runs.map((run) => ({
        id: run.id,
        question: run.question,
        answer: run.answer,
        toolsUsed: JSON.parse(run.toolsUsed) as string[],
        durationMs: run.durationMs,
        error: run.error,
        createdAt: run.createdAt.toISOString(),
      })),
    };
  });
}
