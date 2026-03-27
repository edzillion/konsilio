# Phase 2: Basic MCP Server

## Step 2.1: Create Entry Point

Create `src/index.ts`:
```typescript
#!/usr/bin/env node

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
```

## Step 2.2: Build and Test

```bash
npm run build
node build/index.js    # Should print to stderr: "Council MCP server running on stdio"
```

Press Ctrl+C to exit the stdio loop.

## Step 2.3: Test with Cline

Add to your Cline MCP settings (VS Code):
```json
{
  "servers": {
    "council": {
      "command": "node",
      "args": ["<absolute-path-to>/konsilio/build/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-your-key-here"
      }
    }
  }
}
```

Restart Cline. You should see `konsilio` in available tools. Call `ping` to verify.

## Important: stdout vs stderr

**Never use `console.log()` in an MCP server.** It writes to stdout, which is the MCP protocol channel. Use `console.error()` for all logging — it goes to stderr, which Cline captures separately.
