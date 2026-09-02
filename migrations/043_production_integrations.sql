CREATE TABLE IF NOT EXISTS integration_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, provider text NOT NULL, integration_type text NOT NULL, status text NOT NULL DEFAULT 'DISCONNECTED', external_account_id text, capabilities jsonb NOT NULL DEFAULT '[]'::jsonb, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, last_checked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE UNIQUE INDEX IF NOT EXISTS integration_connections_user_provider_type_key ON integration_connections(user_id, provider, integration_type);
CREATE INDEX IF NOT EXISTS integration_connections_user_idx ON integration_connections(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS financial_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, case_id uuid, provider text NOT NULL, external_transaction_id text, reference text, amount numeric, currency text NOT NULL DEFAULT 'INR', transaction_state text NOT NULL DEFAULT 'UNKNOWN', transaction_at timestamptz, merchant_name text, payment_method text, raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb, source text NOT NULL, verified boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS financial_transactions_case_idx ON financial_transactions(case_id, transaction_at DESC);
CREATE INDEX IF NOT EXISTS financial_transactions_reference_idx ON financial_transactions(reference);
CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_provider_external_key ON financial_transactions(provider, external_transaction_id) WHERE external_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS evidence_analysis (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), evidence_id uuid NOT NULL, case_id uuid NOT NULL, analysis_type text NOT NULL, status text NOT NULL DEFAULT 'PENDING', extracted_text text, structured_data jsonb NOT NULL DEFAULT '{}'::jsonb, authenticity_signals jsonb NOT NULL DEFAULT '[]'::jsonb, confidence numeric, model text, error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS evidence_analysis_evidence_type_key ON evidence_analysis(evidence_id, analysis_type);

CREATE TABLE IF NOT EXISTS communication_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, case_id uuid, channel text NOT NULL, direction text NOT NULL, destination text, provider text, external_message_id text, status text NOT NULL DEFAULT 'QUEUED', template_key text, body text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, delivered_at timestamptz, failed_at timestamptz, error text);
CREATE UNIQUE INDEX IF NOT EXISTS communication_messages_provider_external_key ON communication_messages(provider, external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS communication_messages_case_idx ON communication_messages(case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS action_executions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action_id text NOT NULL, case_id uuid NOT NULL, user_id text NOT NULL, provider text NOT NULL, operation text NOT NULL, request_hash text, status text NOT NULL DEFAULT 'PENDING_APPROVAL', external_id text, response_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), executed_at timestamptz, completed_at timestamptz, error text);
CREATE UNIQUE INDEX IF NOT EXISTS action_executions_action_key ON action_executions(action_id);

CREATE TABLE IF NOT EXISTS reconciliation_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid, user_id text NOT NULL, source text NOT NULL, status text NOT NULL DEFAULT 'RUNNING', matched_transaction_id uuid, match_score numeric, findings jsonb NOT NULL DEFAULT '[]'::jsonb, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, error text);
CREATE INDEX IF NOT EXISTS reconciliation_runs_case_idx ON reconciliation_runs(case_id, started_at DESC);

CREATE TABLE IF NOT EXISTS outcome_training_examples (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL, user_id text NOT NULL, features jsonb NOT NULL DEFAULT '{}'::jsonb, recommended_strategy text, actual_outcome text, resolution_time_hours numeric, reward numeric, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS outcome_training_examples_strategy_idx ON outcome_training_examples(recommended_strategy, actual_outcome);

CREATE TABLE IF NOT EXISTS provider_connectors (provider text PRIMARY KEY, display_name text NOT NULL, connector_type text NOT NULL, environment text NOT NULL DEFAULT 'SANDBOX', enabled boolean NOT NULL DEFAULT false, capabilities jsonb NOT NULL DEFAULT '[]'::jsonb, configuration jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS escalation_deliveries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL, user_id text NOT NULL, destination text NOT NULL, channel text NOT NULL, status text NOT NULL DEFAULT 'PREPARED', external_reference text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, error text);
CREATE INDEX IF NOT EXISTS escalation_deliveries_case_idx ON escalation_deliveries(case_id, created_at DESC);

INSERT INTO provider_connectors (provider,display_name,connector_type,environment,enabled,capabilities) VALUES ('razorpay','Razorpay','PAYMENT_API','SANDBOX',false,'["payment_lookup","refund","webhooks"]'::jsonb) ON CONFLICT (provider) DO NOTHING;
INSERT INTO provider_connectors (provider,display_name,connector_type,environment,enabled,capabilities) VALUES ('account_aggregator','India Account Aggregator','CONSENT_DATA','SANDBOX',false,'["consent","bank_transactions","bank_balances"]'::jsonb) ON CONFLICT (provider) DO NOTHING;
INSERT INTO provider_connectors (provider,display_name,connector_type,environment,enabled,capabilities) VALUES ('twilio','Twilio','COMMUNICATIONS','SANDBOX',false,'["sms","whatsapp"]'::jsonb) ON CONFLICT (provider) DO NOTHING;
INSERT INTO provider_connectors (provider,display_name,connector_type,environment,enabled,capabilities) VALUES ('gemini_document','Google Gemini','DOCUMENT_AI','PRODUCTION',false,'["ocr","document_understanding","evidence_analysis"]'::jsonb) ON CONFLICT (provider) DO NOTHING;