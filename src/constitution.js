// Lightweight quality rules (~300 tokens) appended to every expert prompt.
// See CONTRIBUTIONS_R2.md H2 for why this is slimmer than the reference impl.

export const QUALITY_RULES = `
QUALITY STANDARDS:
1. BE SPECIFIC — Never give generic advice. Name the exact component, flow, or endpoint affected.
2. REFERENCE THE TECH STACK — All recommendations must use the stated technologies. Never suggest incompatible solutions.
3. PRIORITIZE BY IMPACT — CRITICAL first, HIGH second, MEDIUM/LOW last. No filler.
4. BE ACTIONABLE — Each finding must have a concrete mitigation executable by an AI coding agent.
5. NO CODE — Focus on WHAT and WHY. Never write implementation code. Pseudocode acceptable for algorithms.
6. STAY IN YOUR LANE — Analyze from your persona's perspective only.
7. OUTPUT FORMAT — Start with "## [Emoji] [Name] Analysis", use numbered findings. Each: Severity + Issue + Mitigation.
`;