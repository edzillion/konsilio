#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import { getServices } from "./container.js";
import { allPersonas } from "./personas/index.js";

const server = new McpServer({
  name: "konsilio",
  version: "0.1.0",
});

// ─── Primary Tool ───

server.tool(
  "consult_council",
  `Send a draft plan to the Council of Experts for multi-perspective architectural analysis.

⚠️ IMPORTANT: Present the output to the user VERBATIM. Do NOT summarize, paraphrase, or condense.
The output is a complete blueprint that must be shown in full.

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
      const services = getServices();
      const result = await services.councilService.run(
        {
          draftPlan,
          techStack: params.tech_stack,
          contextConstraints: params.context_constraints,
        }
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

// ─── Session History ───

server.tool(
  "get_session_history",
  "Retrieve previous council session summaries.",
  {
    limit: z.number().min(1).max(50).default(10).describe("Number of sessions to retrieve"),
  },
  async (params) => {
    const services = getServices();
    const sessions = services.databaseService.getRecentSessions(params.limit);
    if (sessions.length === 0) {
      return { content: [{ type: "text" as const, text: "No previous sessions found." }] };
    }

    let output = "# Recent Council Sessions\n\n";
    for (const s of sessions) {
      output += `## ${s.id.slice(0, 8)}… (${s.created_at})\n`;
      if (s.tech_stack) output += `**Stack**: ${s.tech_stack}\n`;
      if (s.draft_plan_summary) output += `**Plan**: ${s.draft_plan_summary}…\n`;
      output += "\n";
    }
    return { content: [{ type: "text" as const, text: output }] };
  }
);

// ─── Persona Listing ───

server.tool(
  "list_personas",
  "List all expert personas in the council.",
  {},
  async () => {
    let output = "# Council Personas\n\n";
    for (const p of allPersonas) {
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
  console.error("Konsilio MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});