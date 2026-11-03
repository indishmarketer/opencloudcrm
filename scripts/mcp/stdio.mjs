// Local MCP server: run this from a clone of this repo, pointed at your
// own deployed site. Talks to that site's /api/v1/* API over plain
// HTTPS with your own API token -- no SSH, no direct DB access, no
// dependency on this project's own production infra. That's what makes
// it usable by anyone self-hosting this app, unlike scripts/db-mcp/
// (which is this project owner's own SSH+psql tool, not portable).
//
// Usage: SITE_URL=https://your-site.com API_TOKEN=imk_... node scripts/mcp/stdio.mjs
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTools } from "./tools.mjs";

const SITE_URL = process.env.SITE_URL;
const API_TOKEN = process.env.API_TOKEN;
if (!SITE_URL || !API_TOKEN) {
  console.error("Set SITE_URL and API_TOKEN (issue a token from /console/api-tokens on your site).");
  process.exit(1);
}

const server = new McpServer({ name: "opencloudcrm", version: "1.0.0" });
for (const tool of createTools(SITE_URL, API_TOKEN)) {
  server.tool(tool.name, tool.description, tool.inputSchema, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(await tool.handler(args)) }],
  }));
}

await server.connect(new StdioServerTransport());
