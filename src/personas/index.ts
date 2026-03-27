/**
 * Persona Index - Constitution & Personas
 * 
 * This module exports all persona definitions and provides
 * centralized persona collections for the konsilio system.
 */

import type { Persona } from './types.js';
import { uxDxDesigner } from './ux-dx.js';
import { devopsEngineer } from './devops.js';
import { leadArchitect } from './lead.js';
import { performanceEngineer } from './performance.js';
import { securityArchitect } from './security.js';
import { typescriptEngineer } from './typescript-engineer.js';

// Export individual personas
export { uxDxDesigner } from './ux-dx.js';
export { devopsEngineer } from './devops.js';
export { leadArchitect } from './lead.js';
export { performanceEngineer } from './performance.js';
export { securityArchitect } from './security.js';
export { typescriptEngineer } from './typescript-engineer.js';

// Export types
export * from './types.js';

/**
 * All expert personas (excludes lead architect)
 */
export const expertPersonas: Persona[] = [
  securityArchitect,
  performanceEngineer,
  uxDxDesigner,
  devopsEngineer,
  typescriptEngineer,
];

/**
 * All personas including lead architect
 */
export const allPersonas: Persona[] = [
  ...expertPersonas,
  leadArchitect,
];

/**
 * PersonaCollection - A registry of all available personas
 */
export const PersonaCollection = {
  /**
   * All available personas
   */
  all: allPersonas,

  /**
   * Get a persona by its ID
   */
  getById(id: string): Persona | undefined {
    return this.all.find((persona: Persona) => persona.id === id);
  },

  /**
   * Get personas by domain expertise (if domains are defined)
   */
  getByDomain(domain: string): Persona[] {
    return this.all.filter((persona: Persona) => 
      (persona.domains?.some((d: string) => d.toLowerCase().includes(domain.toLowerCase())) ?? false)
    );
  },

  /**
   * Get all unique domains across all personas
   */
  getAllDomains(): string[] {
    const domains = new Set<string>();
    this.all.forEach((persona: Persona) => {
      persona.domains?.forEach((domain: string) => domains.add(domain));
    });
    return Array.from(domains).sort();
  },

  /**
   * Search personas by query (matches name, id, or domains)
   */
  search(query: string): Persona[] {
    const lowerQuery = query.toLowerCase();
    return this.all.filter((persona: Persona) => {
      const matchesName = persona.name.toLowerCase().includes(lowerQuery);
      const matchesId = persona.id.toLowerCase().includes(lowerQuery);
      const matchesDomain = persona.domains?.some((d: string) => d.toLowerCase().includes(lowerQuery)) ?? false;
      return matchesName || matchesId || matchesDomain;
    });
  }
};

/**
 * Default persona export for convenient imports
 */
export default PersonaCollection;
