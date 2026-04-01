#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import { getServices } from "./container.js";
import pkg from "../package.json" with { type: "json" };

const server = new McpServer({
  name: "konsilio",
  version: pkg.version,
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
- Next Steps for Agent (numbered, executable actions)

The council uses a 4-phase consolidation pipeline:
1. Expert Analysis (parallel, structured JSON output from enabled personas)
2. Extraction (extract claims from expert reports)
3. Critique (identify contradictions and weaknesses)
4. Decision (accept/reject findings)
5. Synthesis (assemble final blueprint)

Use 'list_personas' to see all available personas. Enable personas in konsilio.json.`,
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
      const services = await getServices();
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
    const services = await getServices();
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
    const services = await getServices();
    const personaIds = services.personaService.getAvailablePersonaIds();
    const allPersonas = services.personaService.createExperts(personaIds, 'default');
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