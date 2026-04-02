/**
 * Expert Tests
 *
 * Tests for runtime persona construction from markdown files.
 */

import { describe, it, expect, vi } from 'vitest';
import { Expert, type ExpertConfig } from '../expert.js';
import type { PersonaPromptData } from '../../services/prompt.service.js';

function makeExpertConfig(overrides: Partial<ExpertConfig> = {}): ExpertConfig {
  const mockPromptData: PersonaPromptData = {
    id: 'security',
    name: 'Security Architect',
    emoji: '🔒',
    focusAreas: ['Identity & access management'],
    domains: ['security'],
    antiPatterns: ['Test anti-pattern'],
  };

  return {
    personaId: 'security',
    model: 'google/gemini-2.5-flash-lite',
    expertRules: 'Expert rules content',
    workflowRules: 'Workflow rules content',
    promptService: {
      loadPersonaPromptData: vi.fn().mockReturnValue(mockPromptData),
    },
    ...overrides,
  };
}

describe('Expert', () => {
  it('creates an expert with correct properties', () => {
    const config = makeExpertConfig();
    const expert = new Expert(config);

    expect(expert.id).toBe('security');
    expect(expert.name).toBe('Security Architect');
    expect(expert.emoji).toBe('🔒');
    expect(expert.focusAreas).toEqual(['Identity & access management']);
    expect(expert.domains).toEqual(['security']);
  });

  it('builds system prompt with expert rules', () => {
    const config = makeExpertConfig();
    const expert = new Expert(config);

    expect(expert.systemPrompt).toContain('Expert rules content');
  });

  it('includes workflow rules in system prompt when provided', () => {
    const config = makeExpertConfig({
      workflowRules: 'Custom workflow rules',
    });
    const expert = new Expert(config);

    expect(expert.systemPrompt).toContain('Custom workflow rules');
  });

  it('excludes workflow rules when not provided', () => {
    const config = makeExpertConfig({
      workflowRules: undefined,
    });
    const expert = new Expert(config);

    expect(expert.systemPrompt).not.toContain('undefined');
  });

  it('includes persona name in system prompt', () => {
    const config = makeExpertConfig();
    const expert = new Expert(config);

    expect(expert.systemPrompt).toContain('You are a Security Architect');
  });

  it('includes anti-patterns in system prompt', () => {
    const config = makeExpertConfig();
    const expert = new Expert(config);

    expect(expert.systemPrompt).toContain('## Anti-Patterns');
    expect(expert.systemPrompt).toContain('Test anti-pattern');
  });

  it('excludes anti-patterns section when empty', () => {
    const mockPromptData: PersonaPromptData = {
      id: 'test',
      name: 'Test Expert',
      emoji: '🧪',
      focusAreas: ['testing'],
      domains: ['test'],
      antiPatterns: [],
    };

    const config = makeExpertConfig({
      promptService: {
        loadPersonaPromptData: vi.fn().mockReturnValue(mockPromptData),
      },
    });
    const expert = new Expert(config);

    expect(expert.systemPrompt).not.toContain('## Anti-Patterns');
  });

  it('loads persona data from prompt service', () => {
    const mockLoadPersonaPromptData = vi.fn().mockReturnValue({
      id: 'devops',
      name: 'DevOps Engineer',
      emoji: '🚀',
      focusAreas: ['CI/CD'],
      domains: ['devops'],
      antiPatterns: [],
    });

    const config = makeExpertConfig({
      personaId: 'devops',
      promptService: {
        loadPersonaPromptData: mockLoadPersonaPromptData,
      },
    });

    new Expert(config);

    expect(mockLoadPersonaPromptData).toHaveBeenCalledWith('devops');
  });
});