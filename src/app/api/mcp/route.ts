import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpTools } from "@/lib/mcpTools";
import { SITE_URL } from "@/config/brand";

export const dynamic = "force-dynamic";

/** Remote MCP transport: every self-hoster's own deployed site is its own
 * MCP server, with zero extra infra -- point Claude (or anything else
 * that speaks MCP) at <this site>/api/mcp with the API token issued from
 * /console/api-tokens as a Bearer header. A fresh McpServer + transport
 * per request (stateless mode) since there's no guarantee two requests
 * land on the same server instance in a typical deployment. The tool
 * definitions themselves (src/lib/mcpTools.ts) call this same deployment's
 * /api/v1/* route handlers directly in-process -- the local (stdio) MCP
 * server in scripts/mcp/ talks to the same API, but genuinely over HTTP
 * since it runs as a separate process. */
async function handle(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    // The WWW-Authenticate header's resource_metadata is how an OAuth-
    // capable client (e.g. Claude.ai's remote connector UI) discovers
    // where to register/authorize -- without it, it has no way to find
    // src/app/oauth/* at all. See .well-known/oauth-protected-resource.
    const resourceMetadataUrl = `${SITE_URL.replace(/\/$/, "")}/.well-known/oauth-protected-resource/api/mcp`;
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Missing Authorization header. Issue a token from /console/api-tokens." }, id: null },
      { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"` } }
    );
  }

  const server = new McpServer({ name: "opencloudcrm", version: "1.0.0" });
  for (const tool of createMcpTools(authHeader)) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args: Record<string, unknown>) => {
        try {
          return { content: [{ type: "text" as const, text: JSON.stringify(await tool.handler(args)) }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
        }
      }
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
