import { db } from 'hatchable';
export const access = 'admin';
export const methods = ['GET'];
export default async function(req,res){
 const {rows}=await db.query(`SELECT
  (SELECT count(DISTINCT visitor_key) FROM visitor_sessions WHERE first_seen_at>=now()-interval '1 day') today_visitors,
  (SELECT count(DISTINCT visitor_key) FROM visitor_sessions WHERE first_seen_at>=now()-interval '7 days') week_visitors,
  (SELECT count(DISTINCT visitor_key) FROM visitor_sessions WHERE first_seen_at>=now()-interval '30 days') month_visitors,
  (SELECT count(DISTINCT visitor_key) FROM visitor_sessions) all_time_visitors,
  (SELECT count(DISTINCT visitor_key) FROM visitor_sessions WHERE first_seen_at>=now()-interval '30 days' AND visitor_key IN (SELECT visitor_key FROM visitor_sessions GROUP BY visitor_key HAVING min(first_seen_at)<now()-interval '30 days')) returning_visitors,
  (SELECT count(*) FROM analytics_events WHERE event_name='signup_completed') signups,
  (SELECT count(*) FROM analytics_events WHERE event_name='case_created') cases_created,
  (SELECT count(DISTINCT visitor_key) FROM visitor_sessions WHERE first_seen_at>=now()-interval '30 days' AND engaged) engaged_visitors`);
 const top=await db.query(`SELECT path,count(*) views FROM analytics_events WHERE event_name='page_view' AND created_at>=now()-interval '30 days' GROUP BY path ORDER BY views DESC LIMIT 10`);
 res.json({...rows[0],top_pages:top.rows});
}