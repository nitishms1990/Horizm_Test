/**
 * Short-lived tokens that scope an MCP session to one club.
 *
 * The agent gets one when a question starts; a club can be issued one to point their own
 * agent at the platform. It carries the org id and an expiry, signed with the server
 * secret, so nothing has to be stored and a leaked token dies on its own.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.COOKIE_SECRET ?? "pilot-only-secret-change-before-hosting";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function mintMcpToken(orgId: string, ttlMs = 15 * 60 * 1000): string {
  const payload = `${orgId}.${Date.now() + ttlMs}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

/** Returns the org id, or null when the token is forged, malformed or expired. */
export function readMcpToken(token: string | undefined): string | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const payload = Buffer.from(encoded, "base64url").toString();
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [orgId, expiresAt] = payload.split(".");
  if (!orgId || !expiresAt || Number(expiresAt) < Date.now()) return null;
  return orgId;
}
