export interface Persona {
  id: string;
  name: string;
  emoji: string;
  systemPrompt: string;
  focusAreas: string[];
  // Optional: for future auto_select_personas feature
  domains?: string[];
}

export interface ExpertReport {
  personaId: string;
  personaName: string;
  personaEmoji: string;
  content: string;
  durationMs: number;
  modelUsed: string;
}

export interface CouncilResult {
  sessionId: string;
  expertReports: ExpertReport[];
  debateReports?: ExpertReport[];
  finalBlueprint: string;
  leadModel: string;
  totalDurationMs: number;
}