CREATE TABLE IF NOT EXISTS case_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_case_shares_case ON case_shares(case_id);
CREATE INDEX IF NOT EXISTS idx_case_shares_token ON case_shares(token);