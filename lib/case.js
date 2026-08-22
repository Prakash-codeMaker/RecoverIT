import { db } from 'hatchable';

const TYPES = new Set(['refund_not_received','payment_failed_deducted','duplicate_payment','payment_stuck','payment_reversed','unrecognized_payment','other']);
const STATES = ['REPORTED','VERIFYING','INVESTIGATING','ACTION_REQUIRED','RECOVERY_IN_PROGRESS','WAITING_FOR_PROVIDER','RESOLVED','ESCALATED','FAILED'];

export function newCaseNumber() { return `REC-${Math.floor(100000 + Math.random() * 900000)}`; }
export function normalizeIssue(x) { return TYPES.has(x) ? x : 'other'; }
export async function getCase(id, userId) {
  const r = await db.query('SELECT * FROM recovery_cases WHERE id = $1 AND user_id = $2', [id, userId]);
  return r.rows[0] || null;
}
export async function addEvent(caseId, title, detail, state, source='system', confidence=null) {
  await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source,confidence) VALUES ($1,$2,$3,$4,$5,$6,$7)', [caseId,'CASE_UPDATE',title,detail,state,source,confidence]);
}
export async function addStep(caseId, key, title, status='PENDING', detail=null) {
  await db.query('INSERT INTO investigation_steps (case_id,step_key,title,status,detail) VALUES ($1,$2,$3,$4,$5)', [caseId,key,title,status,detail]);
}
export function safeState(s) { return STATES.includes(s) ? s : 'UNKNOWN'; }