export interface Persona {
  id: string;
  name: string;
  emoji: string;
  systemPrompt: string;
  focusAreas: string[];
  // Optional: for future auto_select_personas feature
  domains?: string[];
}

// ─── Structured Expert Output ───

export interface StructuredFinding {
  id: string;  // Unique identifier for this finding
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  component: string;  // Specific component/flow/endpoint affected
  issue: string;  // Description of the issue
  mitigation: string;  // Concrete mitigation step
}

export interface StructuredRisk {
  id: string;
  category: 'security' | 'performance' | 'operational' | 'ux' | 'technical-debt';
  probability: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  description: string;
}

export interface StructuredExpertOutput {
  personaId: string;
  findings: StructuredFinding[];
  risks: StructuredRisk[];
  missingAssumptions: string[];  // Assumptions not stated in the draft plan
  dependencies: string[];  // External dependencies or prerequisites
}

export interface ExpertReport {
  personaId: string;
  personaName: string;
  personaEmoji: string;
  structuredOutput: StructuredExpertOutput;
  rawContent: string;  // Original JSON response for debugging
  durationMs: number;
  modelUsed: string;
}

// ─── Consolidation Phase Outputs ───

export interface ExtractedClaim {
  id: string;
  personaId: string;
  findingId: string;
  claim: string;
  context: string;
}

export interface Contradiction {
  id: string;
  personaA: string;
  personaB: string;
  findingA: string;
  findingB: string;
  description: string;
}

export interface UnsupportedClaim {
  id: string;
  personaId: string;
  findingId: string;
  claim: string;
  reason: string;
}

export interface ReasoningScore {
  personaId: string;
  score: number;  // 1-10
  reasoning: string;
}

export interface ExtractionPhaseOutput {
  claims: ExtractedClaim[];
  totalFindings: number;
}

export interface CritiquePhaseOutput {
  contradictions: Contradiction[];
  unsupportedClaims: UnsupportedClaim[];
  reasoningScores: ReasoningScore[];
  consensusRisks: string[];  // Patterns where experts agree but may be wrong
}

export interface Decision {
  findingId: string;
  personaId: string;
  action: 'ACCEPT' | 'REJECT';
  reasoning: string;
}

export interface ConflictResolution {
  contradictionId: string;
  selectedPersona: string;
  selectedFindingId: string;
  reasoning: string;
}

export interface DecisionPhaseOutput {
  decisions: Decision[];
  resolutions: ConflictResolution[];
  acceptedCount: number;
  rejectedCount: number;
}

export interface SynthesisPhaseOutput {
  blueprint: string;  // Final markdown output
  acceptedFindings: StructuredFinding[];
  attributions: Record<string, string>;  // findingId -> personaId
}

// ─── Council Result ───

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
}
