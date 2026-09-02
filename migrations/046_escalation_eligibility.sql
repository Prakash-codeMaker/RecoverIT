UPDATE dispute_routes SET level=2 WHERE organization='National Consumer Helpline' AND issue_type='payment_failed_deducted' AND level=1;

CREATE INDEX IF NOT EXISTS dispute_attempts_case_status_idx ON dispute_attempts(case_id,status,level);