CREATE TABLE IF NOT EXISTS e2e_test_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id text NOT NULL UNIQUE,
 scenario text NOT NULL,
 ok boolean NOT NULL DEFAULT false,
 checks jsonb NOT NULL DEFAULT '[]'::jsonb,
 error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS e2e_test_runs_created_idx ON e2e_test_runs(created_at DESC);