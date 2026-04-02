/**
 * Lead Tests
 *
 * Tests for runtime lead construction for consolidation phases.
 */

import { describe, it, expect, vi } from 'vitest';
import { Lead, type LeadConfig } from '../lead.js';

function makeLeadConfig(overrides: Partial<LeadConfig> = {}): LeadConfig {
  return {
    phase: 'extraction',
    workflowRules: 'Workflow rules content',
    promptService: {
      loadConsolidationPhase: vi.fn().mockReturnValue('Phase prompt content'),
    },
    ...overrides,
  };
}

describe('Lead', () => {
  describe('extraction phase', () => {
    it('creates a lead with correct properties', () => {
      const config = makeLeadConfig({ phase: 'extraction' });
      const lead = new Lead(config);

      expect(lead.id).toBe('lead-extraction');
      expect(lead.name).toBe('Extraction Lead');
      expect(lead.emoji).toBe('👑');
      expect(lead.focusAreas).toEqual(['extraction']);
    });

    it('includes phase prompt in system prompt', () => {
      const config = makeLeadConfig({ phase: 'extraction' });
      const lead = new Lead(config);

      expect(lead.systemPrompt).toContain('Phase prompt content');
    });
  });

  describe('critique phase', () => {
    it('creates a lead with correct properties', () => {
      const config = makeLeadConfig({ phase: 'critique' });
      const lead = new Lead(config);

      expect(lead.id).toBe('lead-critique');
      expect(lead.name).toBe('Critique Lead');
      expect(lead.emoji).toBe('👑');
      expect(lead.focusAreas).toEqual(['critique']);
    });
  });

  describe('decision phase', () => {
    it('creates a lead with correct properties', () => {
      const config = makeLeadConfig({ phase: 'decision' });
      const lead = new Lead(config);

      expect(lead.id).toBe('lead-decision');
      expect(lead.name).toBe('Decision Lead');
      expect(lead.emoji).toBe('👑');
      expect(lead.focusAreas).toEqual(['decision']);
    });
  });

  describe('synthesis phase', () => {
    it('creates a lead with correct properties', () => {
      const config = makeLeadConfig({ phase: 'synthesis' });
      const lead = new Lead(config);

      expect(lead.id).toBe('lead-synthesis');
      expect(lead.name).toBe('Synthesis Lead');
      expect(lead.emoji).toBe('👑');
      expect(lead.focusAreas).toEqual(['synthesis']);
    });
  });

  describe('system prompt', () => {
    it('includes workflow rules when provided', () => {
      const config = makeLeadConfig({
        workflowRules: 'Custom workflow rules',
      });
      const lead = new Lead(config);

      expect(lead.systemPrompt).toContain('Custom workflow rules');
    });

    it('excludes workflow rules when not provided', () => {
      const config = makeLeadConfig({
        workflowRules: undefined,
      });
      const lead = new Lead(config);

      expect(lead.systemPrompt).not.toContain('undefined');
    });

    it('loads phase prompt from prompt service', () => {
      const mockLoadConsolidationPhase = vi.fn().mockReturnValue('Custom phase prompt');
      const config = makeLeadConfig({
        phase: 'extraction',
        promptService: {
          loadConsolidationPhase: mockLoadConsolidationPhase,
        },
      });

      new Lead(config);

      expect(mockLoadConsolidationPhase).toHaveBeenCalledWith('extraction');
    });
  });
});