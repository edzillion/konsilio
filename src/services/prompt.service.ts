/**
 * Prompt Service
 * 
 * Loads prompt content from markdown files.
 * Designed for dependency injection to enable testing.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '../logger.js';

export interface PromptServiceConfig {
  /** Root directory for prompt files */
  promptsDir?: string;
}

export interface PersonaPromptData {
  id: string;
  name: string;
  emoji: string;
  focusAreas: string[];
  domains?: string[];
  antiPatterns: string[];
  exampleFindings: Array<{
    id: string;
    severity: string;
    component: string;
    issue: string;
    mitigation: string;
  }>;
  exampleRisks: Array<{
    id: string;
    category: string;
    probability: string;
    impact: string;
    description: string;
  }>;
  exampleMissingAssumptions: string[];
  exampleDependencies: string[];
}

/**
 * PromptService - Loads prompt content from markdown files
 */
export class PromptService {
  private readonly promptsDir: string;
  private readonly logger: Logger;

  constructor(config: PromptServiceConfig | undefined, logger: Logger) {
    this.promptsDir = config?.promptsDir ?? join(process.cwd(), 'src', 'prompts');
    this.logger = logger;
  }

  /**
   * Load persona prompt data from markdown file
   */
  loadPersonaPromptData(personaId: string): PersonaPromptData {
    const filePath = join(this.promptsDir, 'personas', `${personaId}.md`);
    
    if (!existsSync(filePath)) {
      this.logger.warn(`Persona prompt file not found: ${filePath}, using defaults`);
      return this.getDefaultPersonaPromptData();
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      return this.parsePersonaPromptData(content);
    } catch (err) {
      this.logger.error(`Failed to load persona prompt: ${personaId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return this.getDefaultPersonaPromptData();
    }
  }

  /**
   * Load consolidation phase prompt from markdown file
   */
  loadConsolidationPhase(phase: 'extraction' | 'critique' | 'decision' | 'synthesis'): string {
    const filePath = join(this.promptsDir, 'consolidation', `${phase}.md`);
    
    if (!existsSync(filePath)) {
      this.logger.warn(`Consolidation phase file not found: ${filePath}`);
      return '';
    }

    try {
      return readFileSync(filePath, 'utf-8');
    } catch (err) {
      this.logger.error(`Failed to load consolidation phase: ${phase}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return '';
    }
  }

  /**
   * Load expert rules from markdown file
   */
  loadCoreRules(): string {
    const filePath = join(this.promptsDir, 'expert_rules.md');
    
    if (!existsSync(filePath)) {
      this.logger.warn(`Expert rules file not found: ${filePath}`);
      return '';
    }

    try {
      return readFileSync(filePath, 'utf-8');
    } catch (err) {
      this.logger.error('Failed to load expert rules', {
        error: err instanceof Error ? err.message : String(err),
      });
      return '';
    }
  }

  /**
   * Load workflow rules from markdown file
   */
  loadWorkflowRules(): string {
    const filePath = join(this.promptsDir, 'workflow-rules.md');
    
    if (!existsSync(filePath)) {
      this.logger.warn(`Workflow rules file not found: ${filePath}`);
      return '';
    }

    try {
      return readFileSync(filePath, 'utf-8');
    } catch (err) {
      this.logger.error('Failed to load workflow rules', {
        error: err instanceof Error ? err.message : String(err),
      });
      return '';
    }
  }

  /**
   * Parse persona prompt data from markdown content
   */
  private parsePersonaPromptData(content: string): PersonaPromptData {
    const metadata = this.extractYamlFrontmatter(content);
    return {
      id: metadata.id,
      name: metadata.name,
      emoji: metadata.emoji,
      focusAreas: metadata.focusAreas || [],
      domains: metadata.domains,
      antiPatterns: this.extractList(content, '## Anti-Patterns'),
      exampleFindings: this.extractFindings(content, '### Findings'),
      exampleRisks: this.extractRisks(content, '### Risks'),
      exampleMissingAssumptions: this.extractList(content, '### Missing Assumptions'),
      exampleDependencies: this.extractList(content, '### Dependencies'),
    };
  }

  /**
   * Extract YAML frontmatter from markdown content
   */
  private extractYamlFrontmatter(content: string): {
    id: string;
    name: string;
    emoji: string;
    focusAreas: string[];
    domains?: string[];
  } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n/);
    
    if (!match) {
      this.logger.warn('No YAML frontmatter found in persona markdown file');
      return { id: '', name: '', emoji: '', focusAreas: [] };
    }
    
    const yaml = match[1];
    const result: any = { id: '', name: '', emoji: '', focusAreas: [], domains: undefined };
    
    // Simple YAML parsing for our specific format
    const lines = yaml.split('\n');
    let currentKey = '';
    let currentArray: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines
      if (!trimmed) continue;
      
      // Check if it's an array item
      if (trimmed.startsWith('- ')) {
        currentArray.push(trimmed.slice(2).trim());
        continue;
      }
      
      // If we were building an array, save it and reset
      if (currentKey && currentArray.length > 0) {
        result[currentKey] = [...currentArray];
        currentKey = '';
        currentArray = [];
      }
      
      // Parse key: value
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim();
        let value = trimmed.slice(colonIndex + 1).trim();
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        if (value) {
          result[key] = value;
        } else {
          // Empty value means this is an array key
          currentKey = key;
          currentArray = [];
        }
      }
    }
    
    // Save any remaining array
    if (currentKey && currentArray.length > 0) {
      result[currentKey] = [...currentArray];
    }
    
    return result;
  }

  /**
   * Extract a list from markdown content under a header
   */
  private extractList(content: string, header: string): string[] {
    // Match header followed by list items until next header or end
    const regex = new RegExp(`${this.escapeRegex(header)}\\n((?:- .+\\n?)+)`, 'm');
    const match = content.match(regex);
    
    if (!match) return [];
    
    return match[1]
      .split('\n')
      .filter(line => line.startsWith('- '))
      .map(line => line.slice(2).trim());
  }

  /**
   * Extract findings from markdown table format
   */
  private extractFindings(content: string, header: string): PersonaPromptData['exampleFindings'] {
    const regex = new RegExp(`${this.escapeRegex(header)}\\n((?:- \\`.+\\`\\n?)+)`, 'm');
    const match = content.match(regex);
    
    if (!match) return [];
    
    return match[1]
      .split('\n')
      .filter(line => line.startsWith('- `'))
      .map(line => {
        // Extract content between backticks
        const tickMatch = line.match(/- `(.+)`/);
        if (!tickMatch) return null;
        
        const values = tickMatch[1].split(' | ').map(v => v.trim());
        
        return {
          id: values[0] ?? '',
          severity: values[1] ?? 'MEDIUM',
          component: values[2] ?? '',
          issue: values[3] ?? '',
          mitigation: values[4] ?? '',
        };
      })
      .filter((f): f is { id: string; severity: string; component: string; issue: string; mitigation: string } => f !== null);
  }

  /**
   * Extract risks from markdown table format
   */
  private extractRisks(content: string, header: string): PersonaPromptData['exampleRisks'] {
    const regex = new RegExp(`${this.escapeRegex(header)}\\n((?:- \\`.+\\`\\n?)+)`, 'm');
    const match = content.match(regex);
    
    if (!match) return [];
    
    return match[1]
      .split('\n')
      .filter(line => line.startsWith('- `'))
      .map(line => {
        const tickMatch = line.match(/- `(.+)`/);
        if (!tickMatch) return null;
        
        const values = tickMatch[1].split(' | ').map(v => v.trim());
        
        return {
          id: values[0] ?? '',
          category: values[1] ?? 'technical-debt',
          probability: values[2] ?? 'medium',
          impact: values[3] ?? 'medium',
          description: values[4] ?? '',
        };
      })
      .filter((r): r is { id: string; category: string; probability: string; impact: string; description: string } => r !== null);
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Default prompt data when file not found
   */
  private getDefaultPersonaPromptData(): PersonaPromptData {
    return {
      id: 'unknown',
      name: 'Unknown Persona',
      emoji: '?',
      focusAreas: [],
      domains: [],
      antiPatterns: [],
      exampleFindings: [],
      exampleRisks: [],
      exampleMissingAssumptions: [],
      exampleDependencies: [],
    };
  }
}