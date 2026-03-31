import { z } from 'zod';

// ─── Expert Output Schemas ───

export const StructuredFindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  component: z.string(),
  issue: z.string(),
  mitigation: z.string()
});

export const StructuredRiskSchema = z.object({
  id: z.string(),
  category: z.enum(['security', 'performance', 'operational', 'ux', 'technical-debt']),
  probability: z.enum(['high', 'medium', 'low']),
  impact: z.enum(['high', 'medium', 'low']),
  description: z.string()
});

export const StructuredExpertOutputSchema = z.object({
  personaId: z.string(),
  findings: z.array(StructuredFindingSchema),
  risks: z.array(StructuredRiskSchema),
  missingAssumptions: z.array(z.string()),
  dependencies: z.array(z.string())
});

// ─── Consolidation Phase Schemas ───

export const ExtractedClaimSchema = z.object({
  id: z.string(),
  personaId: z.string(),
  findingId: z.string(),
  claim: z.string(),
  context: z.string()
});

export const ExtractionPhaseOutputSchema = z.object({
  claims: z.array(ExtractedClaimSchema),
  totalFindings: z.number()
});

export const ContradictionSchema = z.object({
  id: z.string(),
  personaA: z.string(),
  personaB: z.string(),
  findingA: z.string(),
  findingB: z.string(),
  description: z.string()
});

export const UnsupportedClaimSchema = z.object({
  id: z.string(),
  personaId: z.string(),
  findingId: z.string(),
  claim: z.string(),
  reason: z.string()
});

export const ReasoningScoreSchema = z.object({
  personaId: z.string(),
  score: z.number(),
  reasoning: z.string()
});

export const CritiquePhaseOutputSchema = z.object({
  contradictions: z.array(ContradictionSchema),
  unsupportedClaims: z.array(UnsupportedClaimSchema),
  reasoningScores: z.array(ReasoningScoreSchema),
  consensusRisks: z.array(z.string())
});

export const DecisionSchema = z.object({
  findingId: z.string(),
  personaId: z.string(),
  action: z.enum(['ACCEPT', 'REJECT']),
  reasoning: z.string()
});

export const ConflictResolutionSchema = z.object({
  contradictionId: z.string(),
  selectedPersona: z.string(),
  selectedFindingId: z.string(),
  reasoning: z.string()
});

export const DecisionPhaseOutputSchema = z.object({
  decisions: z.array(DecisionSchema),
  resolutions: z.array(ConflictResolutionSchema),
  acceptedCount: z.number(),
  rejectedCount: z.number()
});

export const SynthesisPhaseOutputSchema = z.object({
  blueprint: z.string(),
  acceptedFindings: z.array(StructuredFindingSchema),
  attributions: z.record(z.string(), z.string())
});

// ─── Non-LLM Types (plain interfaces, not from Zod) ───

export interface Persona {
  id: string;
  name: string;
  emoji: string;
  systemPrompt: string;
  focusAreas: string[];
  domains?: string[];
}

export interface ExpertReport {
  personaId: string;
  personaName: string;
  personaEmoji: string;
  structuredOutput: StructuredExpertOutput;
  rawContent: string;
  durationMs: number;
  modelUsed: string;
}

export interface CouncilResult {
  sessionId: string;
  expertReports: ExpertReport[];
  extractionOutput: ExtractionPhaseOutput;
  critiqueOutput: CritiquePhaseOutput;
  decisionOutput: DecisionPhaseOutput;
  synthesisOutput: SynthesisPhaseOutput;
  finalBlueprint: string;
  consolidationModel: string;
  totalDurationMs: number;
  formattingDetails?: {
    totalFormattingTimeMs: number;
    formattingSuccessRate: number;
    formattingErrors: string[];
  };
}

// ─── Two-Stage Consulting Types ───

export interface ProseExpertOutput {
  personaId: string;
  analysis: string;
  confidence: number;
  keyInsights: string[];
}

export interface FormattedExpertOutput extends StructuredExpertOutput {
  formattingConfidence: number;
  originalProse: string;
}

// ─── Inferred Types (replaces all interfaces) ───

export type StructuredFinding = z.infer<typeof StructuredFindingSchema>;
export type StructuredRisk = z.infer<typeof StructuredRiskSchema>;
export type StructuredExpertOutput = z.infer<typeof StructuredExpertOutputSchema>;
export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;
export type ExtractionPhaseOutput = z.infer<typeof ExtractionPhaseOutputSchema>;
export type Contradiction = z.infer<typeof ContradictionSchema>;
export type UnsupportedClaim = z.infer<typeof UnsupportedClaimSchema>;
export type ReasoningScore = z.infer<typeof ReasoningScoreSchema>;
export type CritiquePhaseOutput = z.infer<typeof CritiquePhaseOutputSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;
export type DecisionPhaseOutput = z.infer<typeof DecisionPhaseOutputSchema>;
export type SynthesisPhaseOutput = z.infer<typeof SynthesisPhaseOutputSchema>;

// ─── Response Format Helper ───

/**
 * Convert a Zod schema to OpenAI response_format structure.
 * Strips the $schema key and produces clean JSON Schema for strict mode.
 */
export function toResponseFormat(schema: z.ZodType, name: string) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema, { reused: 'inline' });
  return {
    type: 'json_schema' as const,
    json_schema: { name, strict: true, schema: jsonSchema }
  };
}