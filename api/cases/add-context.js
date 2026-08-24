import { db, scheduler } from 'hatchable';

export const access = 'user';
export const methods = ['POST'];

export default async function(req, res) {
  const userId = req.user.id;
  const caseId = String(req.body?.case_id || '');
  const reference = String(req.body?.transaction_reference || '').trim().slice(0, 180);
  const providerResponse = String(req.body?.provider_response || '').trim().slice(0, 5000);

  if (!caseId) return res.status(400).json({ error: 'Case ID is required.' });
  if (!reference && !providerResponse) return res.status(400).json({ error: 'Add a transaction/reference number or provider response.' });

  const own = await db.query('SELECT id FROM recovery_cases WHERE id=$1 AND user_id=$2', [caseId, userId]);
  if (!own.rows[0]) return res.status(404).json({ error: 'Case not found.' });

  if (reference) {
    await db.query('UPDATE recovery_cases SET transaction_reference=$1,status=$2,updated_at=now() WHERE id=$3 AND user_id=$4', [reference, 'INVESTIGATING', caseId, userId]);
    await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)', [caseId, 'CONTEXT_ADDED', 'Transaction reference added', 'The customer supplied a transaction/reference number for provider reconciliation.', 'INVESTIGATING', 'User']);
  }

  if (providerResponse) {
    await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2 AND user_id=$3', ['INVESTIGATING', caseId, userId]);
    await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)', [caseId, 'PROVIDER_RESPONSE_ADDED', 'Provider response added', providerResponse, 'INVESTIGATING', 'User']);
  }

  await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4', ['RUNNING', 'New case information received. RecoverIT AI is reconciling it now.', caseId, 'provider']);
  await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4', ['QUEUED', 'Waiting for the updated recovery plan.', caseId, 'safe_path']);
  await scheduler.now('/api/cases/investigate-worker', { case_id: caseId, user_id: userId });

  res.json({ ok: true, investigation_started: true });
}