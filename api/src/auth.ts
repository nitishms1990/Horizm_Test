/**
 * Sessions: a signed cookie holding a session id, with the row in the database so a
 * session can be revoked. Every request that touches club data goes through
 * `requireUser`, which is the only place `orgId` is ever read from.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { db } from "./db.js";

export const SESSION_COOKIE = "horizm_session";
const SESSION_DAYS = 30;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return db.session.create({ data: { userId, expiresAt } });
}

export async function login(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, include: { org: true } });
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) return null;
  const session = await createSession(user.id);
  return { user, session };
}

export type AuthedUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
};

/** Resolves the signed-in user, or null. Never trusts anything the client sends but the cookie. */
export async function currentUser(request: FastifyRequest): Promise<AuthedUser | null> {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;

  const session = await db.session.findUnique({
    where: { id: unsigned.value },
    include: { user: { include: { org: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;

  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgId: user.orgId,
    orgName: user.org.name,
    orgSlug: user.org.slug,
  };
}

/** Fastify preHandler: stops the request unless somebody is signed in. */
export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<AuthedUser | undefined> {
  const user = await currentUser(request);
  if (!user) {
    await reply.code(401).send({ error: "Sign in to continue." });
    return undefined;
  }
  return user;
}
