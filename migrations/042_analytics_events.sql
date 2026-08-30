CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_key text NOT NULL,
  session_key text NOT NULL,
  event_name text NOT NULL,
  path text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
)