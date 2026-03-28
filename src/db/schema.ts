export const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  draft_plan_summary TEXT,
  tech_stack TEXT,
  constraints TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  persona_id TEXT,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expert_findings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  persona_name TEXT NOT NULL,
  persona_emoji TEXT,
  severity TEXT NOT NULL CHECK(severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  component TEXT NOT NULL,
  issue TEXT NOT NULL,
  mitigation TEXT NOT NULL,
  accepted BOOLEAN DEFAULT 0,
  rejection_reason TEXT,
  duration_ms INTEGER,
  model_used TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expert_risks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  category TEXT NOT NULL,
  probability TEXT NOT NULL,
  impact TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS consolidation_phases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  phase_name TEXT NOT NULL CHECK(phase_name IN ('extraction', 'critique', 'decision', 'synthesis')),
  phase_output TEXT NOT NULL,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_findings_session ON expert_findings(session_id);
CREATE INDEX IF NOT EXISTS idx_findings_accepted ON expert_findings(accepted);
CREATE INDEX IF NOT EXISTS idx_risks_session ON expert_risks(session_id);
CREATE INDEX IF NOT EXISTS idx_phases_session ON consolidation_phases(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
`;
