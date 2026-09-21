/**
 * The tools over stdio, for MCP clients that spawn a process.
 *
 *   HORIZM_ORG_ID=<club id> npx tsx src/mcp/stdio.ts
 *
 * The HTTP transport at /mcp is the one the platform itself uses: it is already running,
 * so nothing waits for a process to boot.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHorizmServer } from "./server.js";

const orgId = process.env.HORIZM_ORG_ID;
if (!orgId) {
  console.error("HORIZM_ORG_ID is required: this server is scoped to exactly one club.");
  process.exit(1);
}

await createHorizmServer(orgId).connect(new StdioServerTransport());
