import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOrgRoutes } from "./routes/org.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerSponsorRoutes } from "./routes/sponsors.js";
import { registerMarketplaceRoutes } from "./routes/marketplace.js";
import { registerAudienceRoutes } from "./routes/audience.js";
import { registerAgentRoutes } from "./routes/agent.js";
import { registerMcpRoutes } from "./routes/mcp.js";
import { MEDIA_DIR } from "./paths.js";

const COOKIE_SECRET = process.env.COOKIE_SECRET ?? "pilot-only-secret-change-before-hosting";

export async function buildServer() {
  const app = Fastify({ logger: { transport: undefined, level: process.env.LOG_LEVEL ?? "info" } });

  await app.register(cookie, { secret: COOKIE_SECRET });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
  await app.register(fastifyStatic, { root: MEDIA_DIR, prefix: "/media/" });

  app.get("/v1/health", async () => ({ ok: true }));

  await app.register(registerAuthRoutes, { prefix: "/v1/auth" });
  await app.register(registerOrgRoutes, { prefix: "/v1/org" });
  await app.register(registerPostRoutes, { prefix: "/v1" });
  await app.register(registerSponsorRoutes, { prefix: "/v1/sponsors" });
  await app.register(registerMarketplaceRoutes, { prefix: "/v1/marketplace" });
  await app.register(registerAudienceRoutes, { prefix: "/v1/audience" });
  await app.register(registerAgentRoutes, { prefix: "/v1/agent" });
  await app.register(registerMcpRoutes, { prefix: "/mcp" });

  return app;
}
