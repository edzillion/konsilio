import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { callOpenRouter } from "./openrouter.js";
import { config } from "./config.js";

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

server.tool("test_openrouter", "Test OpenRouter connection.", {}, async () => {
  try {
    const result = await callOpenRouter({
      model: config.models.experts!,
      messages: [{ role: "user", content: "Say 'hello' in one word." }],
      maxTokens: 10,
    });
    return { content: [{ type: "text" as const, text: `✅ OpenRouter: ${result}` }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { content: [{ type: "text" as const, text: `❌ ${msg}` }], isError: true };
  }
});

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