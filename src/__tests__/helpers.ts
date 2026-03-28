/**
 * Shared test helpers and fixtures
 */

import { vi } from 'vitest';
import type { Logger } from '../logger.js';
import type {
  ExpertReport,
  StructuredExpertOutput,
  StructuredFinding,
  StructuredRisk,
  ExtractionPhaseOutput,
  CritiquePhaseOutput,
  DecisionPhaseOutput,
  SynthesisPhaseOutput,
  CouncilResult,
} from '../personas/types.js';
import type { Persona } from '../personas/types.js';

// ─── Mock Logger ───

export function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withCorrelationId: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  };
}

// ─── Fixture Factories ───

export function makeStructuredFinding(overrides: Partial<StructuredFinding> = {}): StructuredFinding {
  return {
    id: 'finding-001',
    severity: 'HIGH',
    component: 'AuthService',
    issue: 'Missing rate limiting on login endpoint',
    mitigation: 'Add rate limiting middleware with 10 req/min per IP',
    ...overrides,
  };
}

export function makeStructuredRisk(overrides: Partial<StructuredRisk> = {}): StructuredRisk {
  return {
    id: 'risk-001',
    category: 'security',
    probability: 'high',
    impact: 'high',
    description: 'Credential stuffing attack vector',
    ...overrides,
  };
}

export function makeStructuredExpertOutput(overrides: Partial<StructuredExpertOutput> = {}): StructuredExpertOutput {
  return {
    personaId: 'security',
    findings: [makeStructuredFinding()],
    risks: [makeStructuredRisk()],
    missingAssumptions: ['Rate limiting strategy not defined'],
    dependencies: ['Redis for rate limiting'],
    ...overrides,
  };
}

export function makeExpertReport(overrides: Partial<ExpertReport> = {}): ExpertReport {
  return {
    personaId: 'security',
    personaName: 'Security Architect',
    personaEmoji: '🔒',
    structuredOutput: makeStructuredExpertOutput(),
    rawContent: JSON.stringify(makeStructuredExpertOutput()),
    durationMs: 1200,
    modelUsed: 'google/gemini-2.5-flash-lite',
    ...overrides,
  };
}

export function makeExtractionOutput(overrides: Partial<ExtractionPhaseOutput> = {}): ExtractionPhaseOutput {
  return {
    claims: [
      {
        id: 'claim-001',
        personaId: 'security',
        findingId: 'finding-001',
        claim: 'Login endpoint lacks rate limiting',
        context: 'AuthService review',
      },
    ],
    totalFindings: 1,
    ...overrides,
  };
}

export function makeCritiqueOutput(overrides: Partial<CritiquePhaseOutput> = {}): CritiquePhaseOutput {
  return {
    contradictions: [],
    unsupportedClaims: [],
    reasoningScores: [{ personaId: 'security', score: 8, reasoning: 'Well-reasoned findings' }],
    consensusRisks: [],
    ...overrides,
  };
}

export function makeDecisionOutput(overrides: Partial<DecisionPhaseOutput> = {}): DecisionPhaseOutput {
  return {
    decisions: [
      {
        findingId: 'finding-001',
        personaId: 'security',
        action: 'ACCEPT',
        reasoning: 'Critical security gap confirmed',
      },
    ],
    resolutions: [],
    acceptedCount: 1,
    rejectedCount: 0,
    ...overrides,
  };
}

export function makeSynthesisOutput(overrides: Partial<SynthesisPhaseOutput> = {}): SynthesisPhaseOutput {
  return {
    blueprint: '# Final Blueprint\n\nAdd rate limiting to login endpoint.',
    acceptedFindings: [makeStructuredFinding()],
    attributions: { 'finding-001': 'security' },
    ...overrides,
  };
}

export function makeCouncilResult(overrides: Partial<CouncilResult> = {}): CouncilResult {
  const expertReports = [
    makeExpertReport({ personaId: 'security', personaName: 'Security Architect', personaEmoji: '🔒' }),
    makeExpertReport({
      personaId: 'performance',
      personaName: 'Performance Engineer',
      personaEmoji: '⚡',
      structuredOutput: makeStructuredExpertOutput({
        personaId: 'performance',
        findings: [makeStructuredFinding({ id: 'finding-002', component: 'QueryLayer', issue: 'N+1 query pattern' })],
      }),
    }),
  ];

  return {
    sessionId: 'test-session-001',
    expertReports,
    extractionOutput: makeExtractionOutput(),
    critiqueOutput: makeCritiqueOutput(),
    decisionOutput: makeDecisionOutput(),
    synthesisOutput: makeSynthesisOutput(),
    finalBlueprint: '> 👑 Council: 2 experts\n\n# Final Blueprint',
    consolidationModel: 'google/gemini-2.5-pro',
    totalDurationMs: 5000,
    ...overrides,
  };
}

export function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'security',
    name: 'Security Architect',
    emoji: '🔒',
    systemPrompt: 'You are a security expert.',
    focusAreas: ['Identity & access management', 'Data protection controls'],
    ...overrides,
  };
}

// ─── Draft Plan Fixture ───

export const SAMPLE_DRAFT_PLAN = `
## User Authentication System

Build a REST API with JWT authentication.

### Components
- POST /auth/login - accepts email/password, returns JWT
- POST /auth/refresh - refreshes access token
- GET /api/users - protected endpoint

### Tech Stack
- Node.js + Express
- PostgreSQL for user storage
- Redis for session management
`.trim();
