/**
 * Schema Tests
 *
 * Tests for Zod schemas: validation, type inference, and JSON schema generation.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  StructuredFindingSchema,
  StructuredRiskSchema,
  StructuredExpertOutputSchema,
  ExtractedClaimSchema,
  ExtractionPhaseOutputSchema,
  ContradictionSchema,
  UnsupportedClaimSchema,
  ReasoningScoreSchema,
  CritiquePhaseOutputSchema,
  DecisionSchema,
  ConflictResolutionSchema,
  DecisionPhaseOutputSchema,
  SynthesisPhaseOutputSchema,
  toResponseFormat,
  type StructuredFinding,
  type StructuredExpertOutput,
  type ExtractionPhaseOutput,
  type CritiquePhaseOutput,
  type DecisionPhaseOutput,
  type SynthesisPhaseOutput,
} from '../schemas.js';

// ─── Helpers ───

function makeValidFinding(): StructuredFinding {
  return {
    id: 'finding-1',
    severity: 'HIGH',
    component: 'API',
    issue: 'Missing rate limiting',
    mitigation: 'Add rate limiter middleware',
  };
}

function makeValidRisk() {
  return {
    id: 'risk-1',
    category: 'security' as const,
    probability: 'high' as const,
    impact: 'high' as const,
    description: 'No rate limiting on auth endpoints',
  };
}

function makeValidExpertOutput(): StructuredExpertOutput {
  return {
    personaId: 'security',
    findings: [makeValidFinding()],
    risks: [makeValidRisk()],
    missingAssumptions: ['Session duration not defined'],
    dependencies: ['Redis'],
  };
}

// ─── Tests ───

describe('StructuredFindingSchema', () => {
  it('parses a valid finding', () => {
    const result = StructuredFindingSchema.safeParse(makeValidFinding());
    expect(result.success).toBe(true);
  });

  it('rejects invalid severity', () => {
    const invalid = { ...makeValidFinding(), severity: 'SEVERE' };
    const result = StructuredFindingSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('severity');
    }
  });

  it('rejects missing required fields', () => {
    const invalid = { id: 'finding-1', severity: 'HIGH' };
    const result = StructuredFindingSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('strips extra fields (passthrough by default, but JSON Schema has additionalProperties: false)', () => {
    const withExtra = { ...makeValidFinding(), extraField: 'should be stripped' };
    const result = StructuredFindingSchema.safeParse(withExtra);
    // Zod v4 strips unknown fields by default in z.object()
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('extraField');
    }
  });
});

describe('StructuredRiskSchema', () => {
  it('parses a valid risk', () => {
    const result = StructuredRiskSchema.safeParse(makeValidRisk());
    expect(result.success).toBe(true);
  });

  it('rejects invalid category', () => {
    const invalid = { ...makeValidRisk(), category: 'invalid' };
    const result = StructuredRiskSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid probability', () => {
    const invalid = { ...makeValidRisk(), probability: 'extreme' };
    const result = StructuredRiskSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('StructuredExpertOutputSchema', () => {
  it('parses a valid expert output', () => {
    const result = StructuredExpertOutputSchema.safeParse(makeValidExpertOutput());
    expect(result.success).toBe(true);
  });

  it('rejects missing personaId', () => {
    const invalid = { ...makeValidExpertOutput(), personaId: undefined };
    const result = StructuredExpertOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects non-array findings', () => {
    const invalid = { ...makeValidExpertOutput(), findings: 'not an array' };
    const result = StructuredExpertOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects findings with invalid severity', () => {
    const invalid = {
      ...makeValidExpertOutput(),
      findings: [{ ...makeValidFinding(), severity: 'EXTREME' }],
    };
    const result = StructuredExpertOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('provides path-aware error messages', () => {
    const invalid = {
      ...makeValidExpertOutput(),
      findings: [{ ...makeValidFinding(), severity: 'EXTREME' }],
    };
    const result = StructuredExpertOutputSchema.safeParse(invalid);
    if (!result.success) {
      const severityError = result.error.issues.find((issue) =>
        issue.path.includes('severity'),
      );
      expect(severityError).toBeDefined();
      expect(severityError!.path).toContain('findings');
    }
  });
});

describe('ExtractionPhaseOutputSchema', () => {
  it('parses valid extraction output', () => {
    const valid: ExtractionPhaseOutput = {
      claims: [
        {
          id: 'claim-1',
          personaId: 'security',
          findingId: 'finding-1',
          claim: 'Missing rate limiting',
          context: 'Auth endpoint',
        },
      ],
      totalFindings: 1,
    };
    const result = ExtractionPhaseOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects non-number totalFindings', () => {
    const invalid = { claims: [], totalFindings: 'one' };
    const result = ExtractionPhaseOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('CritiquePhaseOutputSchema', () => {
  it('parses valid critique output', () => {
    const valid: CritiquePhaseOutput = {
      contradictions: [],
      unsupportedClaims: [],
      reasoningScores: [{ personaId: 'security', score: 8, reasoning: 'Good analysis' }],
      consensusRisks: ['Rate limiting'],
    };
    const result = CritiquePhaseOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid score type', () => {
    const invalid = {
      contradictions: [],
      unsupportedClaims: [],
      reasoningScores: [{ personaId: 'security', score: 'high', reasoning: 'Good' }],
      consensusRisks: [],
    };
    const result = CritiquePhaseOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('DecisionPhaseOutputSchema', () => {
  it('parses valid decision output', () => {
    const valid: DecisionPhaseOutput = {
      decisions: [
        { findingId: 'f1', personaId: 'security', action: 'ACCEPT', reasoning: 'Valid' },
      ],
      resolutions: [],
      acceptedCount: 1,
      rejectedCount: 0,
    };
    const result = DecisionPhaseOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid action', () => {
    const invalid = {
      decisions: [
        { findingId: 'f1', personaId: 'security', action: 'MAYBE', reasoning: 'Unsure' },
      ],
      resolutions: [],
      acceptedCount: 0,
      rejectedCount: 0,
    };
    const result = DecisionPhaseOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('SynthesisPhaseOutputSchema', () => {
  it('parses valid synthesis output', () => {
    const valid: SynthesisPhaseOutput = {
      blueprint: '# Blueprint\n\nContent',
      acceptedFindings: [makeValidFinding()],
      attributions: { 'finding-1': 'security' },
    };
    const result = SynthesisPhaseOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects non-string blueprint', () => {
    const invalid = { blueprint: 123, acceptedFindings: [], attributions: {} };
    const result = SynthesisPhaseOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('toResponseFormat', () => {
  it('generates valid OpenAI response_format structure', () => {
    const result = toResponseFormat(StructuredExpertOutputSchema, 'expert_output');
    expect(result.type).toBe('json_schema');
    expect(result.json_schema.name).toBe('expert_output');
    expect(result.json_schema.strict).toBe(true);
    expect(result.json_schema.schema).toBeDefined();
  });

  it('strips $schema from generated JSON Schema', () => {
    const result = toResponseFormat(StructuredExpertOutputSchema, 'expert_output');
    expect(result.json_schema.schema).not.toHaveProperty('$schema');
  });

  it('includes additionalProperties: false for strict mode', () => {
    const result = toResponseFormat(StructuredExpertOutputSchema, 'expert_output');
    expect(result.json_schema.schema).toHaveProperty('additionalProperties', false);
  });

  it('generates correct enum constraints', () => {
    const result = toResponseFormat(StructuredFindingSchema, 'finding');
    const schema = result.json_schema.schema as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.severity).toHaveProperty('enum');
    expect(properties.severity.enum).toEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
  });

  it('generates correct required fields', () => {
    const result = toResponseFormat(StructuredFindingSchema, 'finding');
    const schema = result.json_schema.schema as Record<string, unknown>;
    expect(schema.required).toEqual(['id', 'severity', 'component', 'issue', 'mitigation']);
  });

  it('handles nested object schemas correctly', () => {
    const result = toResponseFormat(StructuredExpertOutputSchema, 'expert_output');
    const schema = result.json_schema.schema as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.findings).toBeDefined();
    expect(properties.findings.type).toBe('array');
  });
});

describe('Type inference (z.infer)', () => {
  it('infers correct type for StructuredFinding', () => {
    const finding: StructuredFinding = makeValidFinding();
    expect(finding.severity).toBe('HIGH');
    expect(finding.component).toBe('API');
  });

  it('infers correct type for StructuredExpertOutput', () => {
    const output: StructuredExpertOutput = makeValidExpertOutput();
    expect(output.personaId).toBe('security');
    expect(output.findings).toHaveLength(1);
    expect(output.findings[0].severity).toBe('HIGH');
  });
});