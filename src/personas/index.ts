/**
 * Persona Index - Constitution & Personas
 * 
 * This module exports all persona definitions and provides
 * centralized persona collections for the konsilio system.
 * 
 * Each persona represents an expert role with specific expertise,
 * considerations, tools, and evaluation criteria.
 */

// Import personas for collection
import { uxDxDesigner as uxDxDesignerPersona } from './ux-dx.js';
import { devopsEngineer as devopsEngineerPersona } from './devops.js';

// Export individual personas
export { uxDxDesigner } from './ux-dx.js';
export { devopsEngineer } from './devops.js';

/**
 * Persona type definition
 * Represents a complete persona configuration
 */
export interface Persona {
  id: string;
  name: string;
  role: string;
  model: string;
  systemPrompt: string;
  expertise: string[];
  considerations: string[];
  tools: string[];
  domains: string[];
  principles: string[];
  frameworks: string[];
  evaluationCriteria: {
    userExperience?: string[];
    developerExperience?: string[];
    accessibility?: string[];
    [key: string]: string[] | undefined;
  };
  communicationStyle: {
    tone: string;
    focus: string;
    detailLevel: string;
    examples: string;
  };
  collaboration: {
    withOtherExperts: string[];
    deliverables: string[];
  };
}

/**
 * PersonaCollection - A registry of all available personas
 * Provides convenient access to persona groups and search functionality
 */
export const PersonaCollection = {
  /**
   * All available personas
   */
  all: [
    uxDxDesignerPersona,
    devopsEngineerPersona,
  ] as Persona[],

  /**
   * Get a persona by its ID
   */
  getById(id: string): Persona | undefined {
    return this.all.find(persona => persona.id === id);
  },

  /**
   * Get personas by domain expertise
   */
  getByDomain(domain: string): Persona[] {
    return this.all.filter(persona => 
      persona.domains.some(d => d.toLowerCase().includes(domain.toLowerCase()))
    );
  },

  /**
   * Get personas by tool capability
   */
  getByTool(tool: string): Persona[] {
    return this.all.filter(persona =>
      persona.tools.some(t => t.toLowerCase().includes(tool.toLowerCase()))
    );
  },

  /**
   * Get all unique domains across all personas
   */
  getAllDomains(): string[] {
    const domains = new Set<string>();
    this.all.forEach(persona => {
      persona.domains.forEach(domain => domains.add(domain));
    });
    return Array.from(domains).sort();
  },

  /**
   * Get all unique tools across all personas
   */
  getAllTools(): string[] {
    const tools = new Set<string>();
    this.all.forEach(persona => {
      persona.tools.forEach(tool => tools.add(tool));
    });
    return Array.from(tools).sort();
  },

  /**
   * Get all unique principles across all personas
   */
  getAllPrinciples(): string[] {
    const principles = new Set<string>();
    this.all.forEach(persona => {
      persona.principles.forEach(principle => principles.add(principle));
    });
    return Array.from(principles).sort();
  },

  /**
   * Get all unique expertise areas across all personas
   */
  getAllExpertise(): string[] {
    const expertise = new Set<string>();
    this.all.forEach(persona => {
      persona.expertise.forEach(e => expertise.add(e));
    });
    return Array.from(expertise).sort();
  },

  /**
   * Search personas by query (matches name, role, domains, expertise)
   */
  search(query: string): Persona[] {
    const lowerQuery = query.toLowerCase();
    return this.all.filter(persona =>
      persona.name.toLowerCase().includes(lowerQuery) ||
      persona.role.toLowerCase().includes(lowerQuery) ||
      persona.domains.some(d => d.toLowerCase().includes(lowerQuery)) ||
      persona.expertise.some(e => e.toLowerCase().includes(lowerQuery))
    );
  }
};

/**
 * Default persona export for convenient imports
 */
export default PersonaCollection;