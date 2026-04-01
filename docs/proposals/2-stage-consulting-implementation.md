# Two-Stage Consulting Implementation Proposal

## Overview

This document outlines the implementation plan for converting the current 4-phase consolidation pipeline into a two-stage consulting process where experts provide prose analysis, followed by a dedicated formatter that converts the prose into structured JSON output.

## Current State Analysis

The current `CouncilService` implements a 4-phase consolidation pipeline:
1. Expert Analysis (parallel, structured JSON output)
2. Extraction (extract claims from expert reports)
3. Critique (identify contradictions and weaknesses)
4. Decision (accept/reject findings)
5. Synthesis (assemble final blueprint)

Experts currently provide structured JSON output directly, which creates formatting constraints and reduces reasoning quality.

## Proposed Architecture

```
User Request → Expert Analysis (prose) → Formatter Service → Structured JSON → Consolidation Pipeline
```

## Implementation Plan

### 1. Create FormatterService

**File:** `src/services/formatter.service.ts`

This service will:
- Accept prose analysis from experts
- Use response_format with JSON schema for structured output
- Leverage gpt-4o-mini for formatting
- Use Zod for schema validation

**Key Features:**
- JSON schema validation using Zod
- Support for gpt-4o-mini's response_format feature
- Error handling and fallback mechanisms
- Caching of formatting templates

### 2. Modify CouncilService

**Changes to `src/services/council.service.ts`:**

**Phase 1: Expert Analysis**
- Remove structured JSON requirements from expert prompts
- Experts now provide prose analysis
- Add formatter call after expert analysis

**New Phase 1.5: Formatting**
- Call FormatterService for each expert's prose output
- Convert prose to structured JSON using response_format
- Validate output with Zod schemas

**Remaining Phases (2-5)**
- Unchanged, but now work with properly formatted structured data

### 3. Update Expert Personas

**Changes to `src/personas/expert.ts`:**

**System Prompts**
- Remove structured output requirements
- Focus on prose analysis and reasoning
- Add instructions to provide comprehensive analysis

**Example Prompt Update:**
```markdown
## Expert Analysis Prompt (Updated)

Analyze the draft plan and provide comprehensive prose analysis covering:
- Technical strengths and weaknesses
- Security considerations
- Performance implications
- Dependencies and prerequisites
- Risk assessment
- Missing assumptions

Focus on clear reasoning and detailed explanations. Do not worry about formatting - a dedicated formatter will handle structure.
```

### 4. Add Response Format Support

**Implementation in FormatterService:**

```typescript
// Example response_format configuration
const responseFormat = {
  type: 'json_schema',
  json_schema: {
    type: 'object',
    properties: {
      personaId: { type: 'string' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
            component: { type: 'string' },
            issue: { type: 'string' },
            mitigation: { type: 'string' }
          },
          required: ['id', 'severity', 'component', 'issue', 'mitigation']
        }
      },
      risks: { /* ... */ },
      missingAssumptions: { /* ... */ },
      dependencies: { /* ... */ }
    },
    required: ['personaId', 'findings']
  }
};
```

### 5. Update Types and Interfaces

**Changes to `src/personas/types.ts`:**

**New Interfaces:**
```typescript
export interface ProseExpertOutput {
  personaId: string;
  analysis: string;  // Prose analysis
  confidence: number;  // 1-10 confidence score
  keyInsights: string[];  // Key points from analysis
}

export interface FormattedExpertOutput extends StructuredExpertOutput {
  formattingConfidence: number;  // Confidence in formatting accuracy
  originalProse: string;  // Original prose for reference
}
```

**Updated CouncilService Interfaces:**
```typescript
export interface CouncilResult {
  // ... existing properties
  formattingDetails?: {
    totalFormattingTimeMs: number;
    formattingSuccessRate: number;
    formattingErrors: string[];
  };
}
```

### 6. Configuration Updates

**New Configuration Options:**
```typescript
export interface CouncilConfig {
  // ... existing properties
  formatter: {
    model: string;  // Default: 'gpt-4o-mini'
    responseFormat: boolean;  // Enable response_format feature
    timeoutMs: number;
    maxRetries: number;
  };
}
```

### 7. Error Handling and Fallbacks

**Formatter Service Error Handling:**
- Retry logic for formatting failures
- Fallback to manual formatting if AI fails
- Graceful degradation to original structured output if needed
- Comprehensive logging and monitoring

### 8. Testing Strategy

**Unit Tests:**
- FormatterService with various prose inputs
- Integration tests for end-to-end workflow
- Performance tests for formatting speed
- Error handling tests

**Integration Tests:**
- Complete consultation flow with new formatting stage
- Comparison of quality between old and new approaches
- Load testing with multiple concurrent consultations

## Benefits

1. **Improved Reasoning Quality**: Experts can focus on analysis without formatting constraints
2. **Better Structured Output**: Dedicated formatter produces more consistent and accurate JSON
3. **Faster Processing**: Models spend less time on formatting, more on reasoning
4. **Better Error Handling**: Isolated formatting stage makes debugging easier
5. **Future-Proof**: Easier to update formatting logic without affecting expert analysis

## Implementation Timeline

**Phase 1: Foundation**
- Create FormatterService
- Add response_format support
- Update types and interfaces

**Phase 2: Integration**
- Modify CouncilService
- Update expert personas
- Add configuration options

**Phase 3: Testing & Refinement**
- Comprehensive testing
- Performance optimization
- Documentation updates


## Conclusion

This implementation will significantly improve the quality and reliability of our consultation system by separating concerns between expert analysis and structured output formatting. The two-stage approach aligns with best practices in AI system design and leverages the latest capabilities of modern language models.