# Phase 5: Council Orchestrator

## Step 5.1: Create Council Module

Create `src/council.ts`:
```typescript
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { callOpenRouter, type Message } from "./openrouter.js";
import {
  EXPERT_PERSONAS,
  LEAD_ARCHITECT,
  type Persona,
  type ExpertReport,
  type CouncilResult,
} from "./personas/index.js";

export interface CouncilParams {
  draftPlan: string;
  techStack?: string;
  contextConstraints?: string;
}

export interface CouncilOptions {
  debateMode?: boolean;
  modelOverride?: {
    experts?: string;
    lead?: string;
  };
}

// ─── Message Builders ───

function buildUserMessage(params: CouncilParams): string {
  let msg = `## Draft Plan\n\n${params.draftPlan}`;
  if (params.techStack) msg += `\n\n## Tech Stack\n\n${params.techStack}`;
  if (params.contextConstraints) msg += `\n\n## Context Constraints\n\n${params.contextConstraints}`;
  return msg;
}

function buildLeadMessage(params: CouncilParams, reports: ExpertReport[]): string {
  let msg = `## Original Draft Plan\n\n${params.draftPlan}`;
  if (params.techStack) msg += `\n\n## Tech Stack\n\n${params.techStack}`;
  if (params.contextConstraints) msg += `\n\n## Context Constraints\n\n${params.contextConstraints}`;

  msg += `\n\n---\n\n# Expert Council Reports\n\n`;
  for (const report of reports) {
    msg += `${report.content}\n\n---\n\n`;
  }
  msg += `Based on the original draft plan and ALL expert reports above, produce the final unified architecture blueprint.`;
  return msg;
}

function buildDebateMessage(
  persona: Persona,
  originalMessage: string,
  allReports: ExpertReport[],
): string {
  let msg = originalMessage;
  msg += `\n\n---\n\n# Other Expert Reports for Your Review\n\n`;
  for (const report of allReports) {
    if (report.personaId !== persona.id) {
      msg += `## ${report.personaEmoji} ${report.personaName}\n\n${report.content}\n\n`;
    }
  }
  msg += `---\n\nReview the other experts' findings. Identify gaps, agreements, and disagreements. Refine your analysis in the same format.`;
  return msg;
}

// ─── Expert Calling ───

async function callExpert(
  persona: Persona,
  model: string,
  userMessage: string,
  timeoutMs: number,
): Promise<ExpertReport> {
  const start = Date.now();
  const messages: Message[] = [
    { role: "system", content: persona.systemPrompt },
    { role: "user", content: userMessage },
  ];

  const content = await callOpenRouter({
    model,
    messages,
    maxTokens: 4096,
    temperature: 0.3,
    timeoutMs,
  });

  return {
    personaId: persona.id,
    personaName: persona.name,
    personaEmoji: persona.emoji,
    content,
    durationMs: Date.now() - start,
    modelUsed: model,
  };
}

// ─── Main Orchestrator ───

export async function runCouncil(
  params: CouncilParams,
  options?: CouncilOptions,
): Promise<CouncilResult> {
  const totalStart = Date.now();
  const sessionId = randomUUID(); // No nanoid needed — see M1

  const expertModel = options?.modelOverride?.experts ?? config.models.experts ?? "google/gemini-2.5-flash-lite";
  const leadModel = options?.modelOverride?.lead ?? config.models.lead ?? "google/gemini-2.5-pro";
  const personas = EXPERT_PERSONAS;
  const userMessage = buildUserMessage(params);

  // ── Phase 1: Parallel Expert Analysis ──
  const expertPromises = personas.map((persona) =>
    callExpert(persona, expertModel, userMessage, config.timeouts.expertMs)
  );

  const expertResults = await Promise.allSettled(expertPromises);

  const successfulReports: ExpertReport[] = [];
  const failedExperts: string[] = [];

  for (let i = 0; i < expertResults.length; i++) {
    const result = expertResults[i];
    if (result.status === "fulfilled") {
      successfulReports.push(result.value);
    } else {
      failedExperts.push(`${personas[i].emoji} ${personas[i].name}: ${result.reason}`);
    }
  }

  if (successfulReports.length < 2) {
    throw new Error(
      `Too many expert failures (${successfulReports.length}/${personas.length} succeeded).\n\n` +
      failedExperts.join("\n")
    );
  }

  // ── Phase 2: Debate Mode (Optional) ──
  let debateReports: ExpertReport[] | undefined;

  if (options?.debateMode) {
    const debatePromises = personas
      .filter((p) => successfulReports.some((r) => r.personaId === p.id))
      .map((persona) => {
        const debateMsg = buildDebateMessage(persona, userMessage, successfulReports);
        return callExpert(persona, expertModel, debateMsg, config.timeouts.debateMs);
      });

    const debateResults = await Promise.allSettled(debatePromises);
    debateReports = [];
    for (const result of debateResults) {
      if (result.status === "fulfilled") {
        debateReports.push(result.value);
      }
    }
  }

  // ── Phase 3: Lead Architect Synthesis ──
  // FIXED (H5): Lead gets ALL reports — originals AND debate refinements
  const allReportsForLead = debateReports
    ? [...successfulReports, ...debateReports]
    : successfulReports;

  const leadMessages: Message[] = [
    { role: "system", content: LEAD_ARCHITECT.systemPrompt },
    { role: "user", content: buildLeadMessage(params, allReportsForLead) },
  ];

  const finalBlueprint = await callOpenRouter({
    model: leadModel,
    messages: leadMessages,
    maxTokens: 8192,
    temperature: 0.3,
    timeoutMs: config.timeouts.leadMs,
  });

  const totalDurationMs = Date.now() - totalStart;

  // ── Build Output ──
  let output = "";

  if (failedExperts.length > 0) {
    output += `> ⚠️ ${failedExperts.length} expert(s) failed: ${failedExperts.join(", ")}\n`;
    output += `> Proceeding with ${successfulReports.length}/${personas.length} reports.\n\n`;
  }

  output += `> 👑 Council: ${successfulReports.length} experts (${expertModel}) → Lead (${leadModel})`;
  if (debateReports) output += ` | debate: ${debateReports.length} refined`;
  output += `\n> ⏱️ Total: ${(totalDurationMs / 1000).toFixed(1)}s`;
  for (const r of successfulReports) {
    output += ` | ${r.personaEmoji} ${(r.durationMs / 1000).toFixed(1)}s`;
  }
  output += `\n\n---\n\n`;
  output += finalBlueprint;

  return {
    sessionId,
    expertReports: successfulReports,
    debateReports,
    finalBlueprint: output,
    leadModel,
    totalDurationMs,
  };
}
```

### Key fixes vs previous plan
- Uses `crypto.randomUUID()` instead of `nanoid` (M1)
- Debate reports are **merged** with originals for synthesis, not replaced (H5)
- Only debates experts that succeeded in Phase 1
- Expert `maxTokens: 4096` (was 2048) (M3)

## Verification

```bash
npm run build   # Should compile cleanly
```
