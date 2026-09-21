/**
 * The tools over HTTP, at POST /mcp.
 *
 * Always warm, so an agent connects instantly instead of waiting for a process to boot.
 * Each request builds a server scoped to the club named by the token; there is no shared
 * state between requests and no way to widen the scope from inside a tool.
 */
import type { FastifyInstance } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireUser } from "../auth.js";
import { createHorizmServer } from "../mcp/server.js";
import { mintMcpToken, readMcpToken } from "../mcp/token.js";

export async function registerMcpRoutes(app: FastifyInstance) {
  /** Issue a token a club can paste into their own agent's MCP configuration. */
  app.post("/token", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const ttlMinutes = 60;
    return {
      token: mintMcpToken(user.orgId, ttlMinutes * 60 * 1000),
      url: `http://127.0.0.1:${process.env.PORT ?? 4000}/mcp`,
      expiresInMinutes: ttlMinutes,
      header: "x-horizm-token",
    };
  });

  app.post("/", async (request, reply) => {
    // Either a signed-in session (the platform's own agent) or a scoped token.
    const header = request.headers["x-horizm-token"];
    const orgId =
      readMcpToken(Array.isArray(header) ? header[0] : header) ?? (await requireUser(request, reply))?.orgId;
    if (!orgId) return;

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.hijack(); // the transport writes the response itself

    reply.raw.on("close", () => {
      void transport.close();
    });

    await createHorizmServer(orgId).connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });
}
