CREATE TABLE IF NOT EXISTS case_brain (
 case_id UUID PRIMARY KEY,
 user_id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 facts JSONB NOT NULL DEFAULT '{}'::jsonb,
 evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
 claims JSONB NOT NULL DEFAULT '[]'::jsonb,
 contradictions JSONB NOT NULL DEFAULT '[]'::jsonb,
 ownership TEXT NOT NULL DEFAULT 'RECOVERIT',
 ownership_reason TEXT NOT NULL DEFAULT 'RecoverIT is assessing the case.',
 next_action_type TEXT NOT NULL DEFAULT 'MONITOR',
 next_action TEXT NOT NULL DEFAULT 'RecoverIT is checking the case.',
 needs_user BOOLEAN NOT NULL DEFAULT FALSE,
 confidence NUMERIC,
 last_rebuilt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_brain_user_idx ON case_brain(user_id);