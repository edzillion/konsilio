# Phase 6: MCP Tool Registration + First Working Council

**After this phase, you have a fully working council with no persistence.**

## Step 6.1: Final `src/index.ts`

Replace `src/index.ts` with the full tool registration:
```typescript
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import { runCouncil } from "./council.js";
import { ALL_PERSONAS } from "./personas/index.js";

const server = new McpServer({
  name: "konsilio",
  version: "0.1.0",
});

// ─── Primary Tool ───

server.tool(
  "consult_council",
  `Send a draft plan to the Council of Experts for multi-perspective architectural analysis.

Returns a structured blueprint with:
- Architecture Directives (specific decisions)
- Edge Cases & Failure Modes
- Required Constraints
- Recommended Patterns
- Next Steps for Agent (numbered, executable actions)

The council consists of 4 expert personas (Security, Performance, UX/DX, DevOps)
who analyze in parallel, then a Lead Architect synthesizes their findings.`,
  {
    draft_plan: z.string().describe(
      "The architecture plan or design to analyze."
    ),
    tech_stack: z.string().optional().describe(
      "Technology stack, e.g. 'Node.js, PostgreSQL, Redis, Docker'"
    ),
    context_constraints: z.string().optional().describe(
      "Runtime constraints, e.g. 'Must run on Proxmox LXC', 'No external deps'"
    ),
    debate_mode: z.boolean().optional().default(false).describe(
      "Experts critique each other before synthesis. Slower but more thorough."
    ),
  },
  async (params) => {
    const draftPlan = params.draft_plan.trim();

    if (!draftPlan) {
      return {
        content: [{ type: "text" as const, text: "❌ Error: draft_plan cannot be empty." }],
        isError: true,
      };
    }

    if (draftPlan.length > config.maxDraftPlanLength) {
      return {
        content: [{
          type: "text" as const,
          text: `❌ Error: draft_plan too long (${draftPlan.length}/${config.maxDraftPlanLength} chars).`,
        }],
        isError: true,
      };
    }

    try {
      const result = await runCouncil(
        {
          draftPlan,
          techStack: params.tech_stack,
          contextConstraints: params.context_constraints,
        },
        { debateMode: params.debate_mode }
      );

      return {
        content: [{ type: "text" as const, text: result.finalBlueprint }],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: `❌ Council error: ${msg}` }],
        isError: true,
      };
    }
  }
);

// ─── Persona Listing ───

server.tool(
  "list_personas",
  "List all expert personas in the council.",
  {},
  async () => {
    let output = "# Council Personas\n\n";
    for (const p of ALL_PERSONAS) {
      output += `## ${p.emoji} ${p.name}\n`;
      output += `**ID**: \`${p.id}\`\n`;
      output += `**Focus**: ${p.focusAreas.join(", ")}\n\n`;
    }
    return { content: [{ type: "text" as const, text: output }] };
  }
);

// ─── Health Check ───

server.tool("ping", "Test if Council MCP is running.", {}, async () => ({
  content: [{
    type: "text" as const,
    text: "🏓 Council MCP is running! Use 'consult_council' to get expert analysis.",
  }],
}));

// ─── Start ───

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Council MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

## Step 6.2: Build and Test

```bash
npm run build
```

### Manual Testing Checklist

1. **Build succeeds**: `npm run build` — no errors
2. **Cline sees tools**: Restart Cline, verify `konsilio` appears with 3 tools
3. **Ping works**: Call `ping` → "🏓 Council MCP is running!"
4. **List personas**: Call `list_personas` → shows 5 personas
5. **Basic council**: Call `consult_council` with:
   - `draft_plan`: "Build a REST API with JWT auth and rate limiting"
   - `tech_stack`: "Node.js, Express, SQLite"
   - Should return structured blueprint in 15-30 seconds
6. **Debate mode**: Same call with `debate_mode: true` — takes longer, more refined
7. **Empty plan error**: Call with empty `draft_plan` → clear error message
8. **Bad API key**: Set wrong key → "Unauthorized" error

### 🎉 Milestone: Working Council

After this phase, the core product works end-to-end. Persistence (Phase 7) and deployment (Phase 8) are enhancements.
