import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "konsilio",
  version: "0.1.0",
});

// Health check tool (for testing connectivity)
server.tool(
  "ping",
  "Test if the Council MCP server is running.",
  {},
  async () => ({
    content: [{
      type: "text" as const,
      text: "🏓 Council MCP is running! Use 'consult_council' to get expert analysis.",
    }],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Use stderr for logging — stdout is reserved for MCP protocol
  console.error("Council MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});