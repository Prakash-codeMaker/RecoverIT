ALTER TABLE recovery_cases ADD COLUMN IF NOT EXISTS verification_state text NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE recovery_cases ADD COLUMN IF NOT EXISTS verification_confidence numeric;
ALTER TABLE recovery_cases ADD COLUMN IF NOT EXISTS verification_last_checked_at timestamptz;
ALTER TABLE recovery_cases ADD COLUMN IF NOT EXISTS verification_last_available_at timestamptz;
ALTER TABLE recovery_cases ADD COLUMN IF NOT EXISTS verification_reason text;

CREATE TABLE IF NOT EXISTS case_verification_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL, user_id text NOT NULL, trigger text NOT NULL, status text NOT NULL DEFAULT 'RUNNING', result text NOT NULL DEFAULT 'UNVERIFIED', confidence numeric, verified_evidence_count integer NOT NULL DEFAULT 0, rejected_evidence_count integer NOT NULL DEFAULT 0, review_evidence_count integer NOT NULL DEFAULT 0, ai_available boolean NOT NULL DEFAULT false, details jsonb NOT NULL DEFAULT '{}'::jsonb, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, error text);
CREATE INDEX IF NOT EXISTS case_verification_runs_case_idx ON case_verification_runs(case_id, started_at DESC);
CREATE INDEX IF NOT EXISTS recovery_cases_verification_idx ON recovery_cases(verification_state, verification_last_checked_at, updated_at);