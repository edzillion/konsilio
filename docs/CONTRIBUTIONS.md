# Council MCP - Contributions & Design Rationale

## Document Purpose

This document outlines the contributions made during the planning phase, the rationale behind key design decisions, and how the final plan synthesizes the best elements from the original skeleton plan and the reference implementation (deepplan-mcp).

---

## Summary of Contributions

### 1. Architecture Corrections

#### Original Plan Issue: "Critic" Pattern
The original plan (`council2.md`) proposed a sequential flow:
```
User → Expert → Critic → Response
```

#### Correction Applied
After analyzing the reference implementation, I identified that this approach has fundamental limitations:
- **Single perspective bottleneck**: One critic can't cover all domains
- **Sequential dependency**: Critic depends on expert success
- **Limited conflict resolution**: No mechanism for handling contradictory advice

The reference implementation uses a superior pattern:
```
User → [Security | Performance | UX/DX | DevOps] (parallel) → Lead Architect → Response
```

**Rationale**: The parallel expert approach provides:
1. **Multiple simultaneous perspectives** - Security issues differ from performance issues
2. **Graceful degradation** - If one expert fails, others continue
3. **Structured synthesis** - Lead Architect explicitly resolves conflicts
4. **Better coverage** - Each domain has dedicated analysis

### 2. Added: The Constitution Layer

#### What Was Missing
Neither the original plan nor the reference implementation explicitly documented quality enforcement rules as a separate module.

#### Contribution
Created `src/constitution.ts` as a standalone module that defines:
- **Terminology Precision**: Correct use of architectural terms
- **Specificity Requirement**: No generic advice without specifics
- **Tech Stack Awareness**: All recommendations must reference the stack
- **Impact Prioritization**: Critical issues first, no filler
- **No Code Output**: Focus on WHAT and WHY, not HOW
- **Actionable Output**: Each finding must have concrete mitigation

**Rationale**: By extracting these rules into a shared module:
1. All personas inherit the same quality standards
2. Easy to update rules in one place
3. Can be extended for custom personas
4. Provides clear documentation of quality expectations

### 3. Added: Debate Mode (User Requested)

#### What Was Missing
The reference implementation had no mechanism for experts to critique each other.

#### Contribution
Added an optional `debate_mode` flag that:
1. Runs initial expert analysis (Phase 1)
2. Shows each expert the other experts' findings
3. Asks each expert to refine their analysis (Phase 2)
4. Proceeds to Lead Architect synthesis (Phase 3)

**Rationale**: 
- **Catches blind spots**: Security expert might miss performance implications
- **Refines recommendations**: "Actually, the caching strategy I suggested could cause race conditions..."
- **User choice**: Optional flag allows balancing speed vs. thoroughness
- **Cost awareness**: User knows debate mode doubles expert API calls

### 4. Enhanced: SQLite Persistence

#### Original Plan
The original plan included SQLite but with a minimal schema:
```sql
CREATE TABLE sessions (...);
CREATE TABLE messages (...);
CREATE TABLE persona_configs (...);
```

#### Contribution
Expanded the schema to include:
```sql
CREATE TABLE expert_reports (
  session_id TEXT,
  persona_id TEXT,
  content TEXT,
  duration_ms INTEGER,
  model_used TEXT,
  is_debate BOOLEAN,
  ...
);
```

**Rationale**:
1. **Separate expert outputs**: Allows retrieving individual expert analysis later
2. **Performance tracking**: `duration_ms` helps identify slow experts
3. **Model tracking**: `model_used` enables cost analysis
4. **Debate tracking**: `is_debate` distinguishes initial vs. refined analysis
5. **Session pruning**: Automatic cleanup of old sessions (last 10 only)

### 5. Added: Model Selection Strategy

#### What Was Missing
The original plan didn't specify which models to use for different roles.

#### Contribution
Defined sensible defaults with rationale:

| Role | Model | Rationale |
|------|-------|-----------|
| Experts | `google/gemini-2.0-flash-001` | Fast, cheap, good enough for domain analysis |
| Lead Architect | `anthropic/claude-3.5-sonnet` | Superior synthesis and reasoning |
| Debate | `google/gemini-2.0-flash-001` | Quick critique rounds, cost-effective |

**Rationale**:
- **Cost optimization**: Experts are called 4x (or 8x with debate), so they should be cheap
- **Quality at synthesis**: Lead Architect is called once, so quality matters more than cost
- **User override**: Configuration allows changing models per role

### 6. Added: Graceful Degradation

#### What Was Missing
The original plan didn't address partial failures.

#### Contribution
Implemented `Promise.allSettled` pattern:
```typescript
const expertResults = await Promise.allSettled(expertPromises);

// Continue with successful reports
if (successfulReports.length < 2) {
  throw new Error("Too many expert failures...");
}
// Proceed with partial results
```

**Rationale**:
1. **Resilience**: One API timeout shouldn't kill the entire request
2. **Minimum threshold**: Need at least 2 experts for meaningful synthesis
3. **User visibility**: Report which experts failed in the output
4. **Cost protection**: Don't waste successful API calls

### 7. Added: Structured Output Format

#### What Was Missing
The original plan didn't specify output structure.

#### Contribution
Enforced exact Markdown structure in Lead Architect prompt:
```markdown
## Architecture Directives
## Edge Cases & Failure Modes
## Required Constraints
## Recommended Patterns
## Next Steps for Agent
```

**Rationale**:
1. **Consistency**: Every response has the same structure
2. **Parseability**: AI agents can reliably extract sections
3. **Actionability**: "Next Steps for Agent" is designed for AI execution
4. **Documentation**: Clear sections help humans review

### 8. Added: MCP Tool Documentation

#### What Was Missing
The original plan didn't include tool descriptions for MCP clients.

#### Contribution
Added comprehensive tool descriptions:
```typescript
server.tool(
  "consult_council",
  `Send a draft plan to the Council of Experts for multi-perspective analysis.

Returns a structured blueprint with:
- Architecture Directives (specific decisions)
- Edge Cases & Failure Modes
...`,
  { /* schema */ },
  async (params) => { /* ... */ }
);
```

**Rationale**:
1. **Discoverability**: Cline/Cursor shows descriptions to users
2. **Usage guidance**: Explains when to use the tool
3. **Parameter hints**: Describes what each parameter does
4. **Expectation setting**: Describes output format

---

## Design Decisions & Trade-offs

### Decision 1: SQLite vs. In-Memory

**Choice**: SQLite with WAL mode

**Alternatives Considered**:
- In-memory only (simpler, but loses history)
- PostgreSQL (overkill for single user)
- File-based JSON (no querying, concurrency issues)

**Trade-offs**:
- ✅ Persistence across restarts
- ✅ Queryable history
- ✅ Simple deployment (single file)
- ❌ Requires native compilation (better-sqlite3)
- ❌ Potential locking issues (mitigated by WAL mode)

**Rationale**: For a single-user local deployment, SQLite provides the best balance of simplicity and functionality.

### Decision 2: Parallel vs. Sequential Expert Calls

**Choice**: Parallel (`Promise.all`)

**Alternatives Considered**:
- Sequential (simpler error handling, but slower)
- Hybrid (parallel with rate limiting)

**Trade-offs**:
- ✅ 4x faster (experts run simultaneously)
- ✅ Better user experience
- ❌ More complex error handling
- ❌ Higher instantaneous API load

**Rationale**: Latency is the primary concern for interactive use. Parallel execution reduces total time from ~40s to ~10s for expert phase.

### Decision 3: Model Selection Flexibility

**Choice**: Environment variables with sensible defaults

**Alternatives Considered**:
- Hardcoded models (simpler, but inflexible)
- Per-request model selection (too complex for MVP)

**Trade-offs**:
- ✅ Easy experimentation
- ✅ Cost optimization options
- ✅ No code changes to swap models
- ❌ Configuration complexity

**Rationale**: Model landscape changes rapidly. Users should be able to swap models without code changes.

### Decision 4: Debate Mode as Optional Flag

**Choice**: `debate_mode: boolean` parameter, default `false`

**Alternatives Considered**:
- Always on (too slow/expensive)
- Separate tool (code duplication)
- Configuration file setting (less flexible)

**Trade-offs**:
- ✅ User controls speed vs. thoroughness
- ✅ Same tool interface
- ✅ Per-request decision
- ❌ Additional parameter complexity

**Rationale**: Different plans need different levels of scrutiny. A simple API endpoint doesn't need debate mode; a multi-service architecture does.

### Decision 5: History Limit (10 Sessions)

**Choice**: Keep last 10 sessions, auto-prune

**Alternatives Considered**:
- Unlimited history (disk growth)
- Time-based expiry (more complex)
- Manual cleanup (user burden)

**Trade-offs**:
- ✅ Predictable disk usage
- ✅ No user maintenance
- ✅ Sufficient context for most workflows
- ❌ Lost older context

**Rationale**: 10 sessions provides ~1-2 weeks of context for typical usage patterns while keeping storage bounded.

---

## Comparison: Original Plan vs. Final Plan

| Aspect | Original Plan | Final Plan |
|--------|---------------|------------|
| **Architecture** | Expert → Critic (sequential) | 4 Experts → Lead Architect (parallel) |
| **Quality Control** | Implicit in Critic | Explicit Constitution module |
| **Persistence** | Basic SQLite schema | Enhanced schema with expert_reports |
| **Model Selection** | Not specified | Sensible defaults with override |
| **Error Handling** | Not addressed | Graceful degradation |
| **Output Format** | Not specified | Structured Markdown sections |
| **Debate Mode** | Not included | Optional flag |
| **History** | Not specified | Last 10 sessions, auto-prune |
| **Deployment** | LXC script | Enhanced LXC + PM2 config |

---

## Key Insights from Reference Implementation

### What I Adopted Directly

1. **Parallel expert pattern**: The reference implementation's approach is fundamentally sound
2. **Persona structure**: Name, emoji, system prompt, focus areas
3. **OpenRouter integration**: Headers, error handling, timeout patterns
4. **MCP tool registration**: Using `zod` for schema validation

### What I Improved

1. **Modularization**: Separated personas into individual files
2. **Constitution extraction**: Made quality rules explicit and reusable
3. **Persistence**: Added comprehensive database schema
4. **Error messages**: More actionable guidance in error responses
5. **Documentation**: Comprehensive architecture and implementation docs

### What I Added

1. **Debate mode**: Optional expert critique round
2. **History management**: Session persistence and retrieval
3. **Model configuration**: Flexible model selection per role
4. **Graceful degradation**: Continue with partial results
5. **Deployment tooling**: PM2 ecosystem config, setup scripts

---

## Risks & Mitigations

### Risk 1: Context Window Bloat

**Problem**: Each request generates ~16K tokens of expert output.

**Mitigation**: 
- Sliding window for history (last 10 sessions only)
- Lead Architect synthesizes, not concatenates
- Explicit instruction to limit output length

### Risk 2: API Cost Overrun

**Problem**: Debate mode doubles API calls.

**Mitigation**:
- Default `debate_mode: false`
- Use cheap models for experts (Gemini Flash)
- Cost estimation in documentation

### Risk 3: Latency

**Problem**: Even parallel, 4 experts + lead = 15-30 seconds.

**Mitigation**:
- Accept latency as per requirements ("can be slow")
- Use fast models for experts
- Clear timing metadata in response

### Risk 4: SQLite in LXC

**Problem**: Native module compilation can fail.

**Mitigation**:
- Install `build-essential` and `python3` in setup script
- Use Node.js 20.x (compatible with better-sqlite3)
- WAL mode for better concurrency

---

## Future Considerations

These are explicitly out of scope for MVP but noted for future development:

1. **Streaming responses**: Stream expert outputs as they complete
2. **Web UI**: Dashboard for viewing history and managing personas
3. **Custom persona builder**: UI for creating domain-specific experts
4. **Cost tracking**: Monitor OpenRouter spending per session
5. **Export/Import**: Backup and restore sessions
6. **Multi-language support**: Non-English tech stack documentation

---

## Conclusion

The final plan synthesizes:
- **From the original plan**: SQLite persistence, LXC deployment, single-user assumptions
- **From the reference implementation**: Parallel expert pattern, persona structure, MCP integration
- **New contributions**: Constitution layer, debate mode, enhanced persistence, graceful degradation

The result is a comprehensive, actionable plan that addresses the core problem (AI yes-man behavior) while providing flexibility for future enhancement.
</task_progress>
- [x] Read existing plan (council2.md)
- [x] Research reference implementation (deepplan-mcp)
- [x] Analyze Reddit motivation and deepplan.dev website
- [x] Compare plan vs reference implementation
- [x] Identify gaps, issues, and improvements
- [x] Create comprehensive planning documents
- [x] Write contribution/rationale document
</task_progress>