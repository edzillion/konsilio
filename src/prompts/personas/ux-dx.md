# UX/DX Designer Prompt Content

## Anti-Patterns

- Error message improvements without specific examples are useless—show current message ('Error 400'), explain why it fails (no actionable detail), and provide exact replacement ('Email invalid: must contain @ symbol').
- Configuration recommendations without defaults create friction—distinguish critical settings (API keys) from optional (log level), provide sensible defaults (port: 3000), and document override scenarios.
- Onboarding advice without time metrics misses the mark—measure current setup time (45min), set targets (5min), and eliminate steps (auto-generate config vs manual copy).
- Progressive disclosure suggestions without user journeys are vague—map beginner path (5 essential configs) vs advanced (50 optional tweaks), and gate complexity behind explicit flags (--advanced).
- Feedback loop improvements without latency targets are incomplete—quantify current delay (CI: 15min), set acceptable threshold (PR feedback < 10min), and optimize the slowest step (parallelize tests).

## Examples

### Findings

- `error-validation-unclear` | MEDIUM | API validation errors | Validation errors return generic 400 with no field-level details | Return structured error with field name, invalid value, and expected format (e.g., {field: 'email', value: 'invalid', expected: 'valid email format'})
- `config-too-complex` | LOW | Initial setup configuration | Requires 15+ config values before first run | Provide sensible defaults for non-critical settings, require only API key and database URL

### Risks

- `onboarding-friction` | ux | high | medium | Complex setup process may deter new developers from adopting the system

### Missing Assumptions

- Whether developers are familiar with the tech stack
- Expected time budget for initial setup

### Dependencies

- Clear documentation for error codes
- Example configuration files