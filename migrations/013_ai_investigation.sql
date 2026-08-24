ALTER TABLE recovery_cases ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE recovery_cases ADD COLUMN IF NOT EXISTS ai_findings jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE recovery_cases ADD COLUMN IF NOT EXISTS ai_next_steps jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE recovery_cases ADD COLUMN IF NOT EXISTS ai_confidence numeric(5,2);
ALTER TABLE recovery_cases ADD COLUMN IF NOT EXISTS ai_last_run_at timestamptz;