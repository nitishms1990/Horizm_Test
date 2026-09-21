import type { FastifyInstance } from "fastify";
import { loginSchema } from "@horizm/contracts";
import { SESSION_COOKIE, currentUser, login } from "../auth.js";
import { db } from "../db.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Enter an email address and password." });
    }

    const result = await login(parsed.data.email, parsed.data.password);
    if (!result) {
      // Deliberately vague: don't reveal whether the address exists.
      return reply.code(401).send({ error: "That email and password don't match." });
    }

    reply.setCookie(SESSION_COOKIE, result.session.id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      signed: true,
      expires: result.session.expiresAt,
    });

    return {
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        orgName: result.user.org.name,
        orgSlug: result.user.org.slug,
      },
    };
  });

  app.post("/logout", async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE];
    const unsigned = raw ? request.unsignCookie(raw) : null;
    if (unsigned?.valid && unsigned.value) {
      await db.session.deleteMany({ where: { id: unsigned.value } });
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/me", async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return reply.code(401).send({ error: "Not signed in." });
    return { user };
  });
}
