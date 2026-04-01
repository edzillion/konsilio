/**
 * Prompt Service
 * 
 * Loads prompt content from markdown files.
 * Designed for dependency injection to enable testing.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
}

/**
 * PromptService - Loads prompt content from markdown files
 */
export class PromptService {
  private readonly promptsDir: string;
  private readonly logger: Logger;

  constructor(config: PromptServiceConfig | undefined, logger: Logger) {
    // Resolve prompts relative to this file's location (works in both src/ and build/)
    this.promptsDir = config?.promptsDir ?? join(__dirname, '..', 'prompts');
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
    const filePath = join(this.promptsDir, 'expert-rules.md');
    
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
    const antiPatterns = this.extractAntiPatterns(content);
    
    return {
      id: metadata.id,
      name: metadata.name,
      emoji: metadata.emoji,
      focusAreas: metadata.focusAreas,
      domains: metadata.domains,
      antiPatterns,
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
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    
    if (!match) {
      this.logger.warn('No YAML frontmatter found in persona markdown file');
      return { id: '', name: '', emoji: '', focusAreas: [] };
    }
    
    const yaml = match[1];
    const result: { id: string; name: string; emoji: string; focusAreas: string[]; domains?: string[] } = {
      id: '',
      name: '',
      emoji: '',
      focusAreas: [],
      domains: undefined,
    };
    
    // Simple YAML parsing for our specific format
    const lines = yaml.split(/\r?\n/);
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
        (result as Record<string, string[] | string | undefined>)[currentKey] = [...currentArray];
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
          (result as Record<string, string[] | string | undefined>)[key] = value;
        } else {
          // Empty value means this is an array key
          currentKey = key;
          currentArray = [];
        }
      }
    }
    
    // Save any remaining array
    if (currentKey && currentArray.length > 0) {
      (result as unknown as Record<string, unknown>)[currentKey] = [...currentArray];
    }
    
    return result;
  }

  /**
   * Extract anti-patterns from markdown content
   */
  private extractAntiPatterns(content: string): string[] {
    // Find the Anti-Patterns section and extract list items
    const match = content.match(/## Anti-Patterns\r?\n\r?\n([\s\S]*?)(?=\r?\n## |$)/);
    
    if (!match) return [];
    
    return match[1]
      .split(/\r?\n/)
      .filter(line => line.startsWith('- '))
      .map(line => line.slice(2).trim());
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
    };
  }
}