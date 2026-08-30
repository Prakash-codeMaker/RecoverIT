import { db } from 'hatchable';
export const access = 'admin';
export const methods = ['GET'];
export default async function(req,res){
 const {rows}=await db.query(`SELECT
  (SELECT count(DISTINCT visitor_id) FROM visitor_sessions WHERE first_seen_at>=now()-interval '1 day') today_visitors,
  (SELECT count(DISTINCT visitor_id) FROM visitor_sessions WHERE first_seen_at>=now()-interval '7 days') week_visitors,
  (SELECT count(DISTINCT visitor_id) FROM visitor_sessions WHERE first_seen_at>=now()-interval '30 days') month_visitors,
  (SELECT count(DISTINCT visitor_id) FROM visitor_sessions) all_time_visitors,
  (SELECT count(DISTINCT visitor_id) FROM visitor_sessions WHERE visitor_id IN (SELECT visitor_key FROM analytics_events WHERE event_name='engaged')) engaged_visitors,
  (SELECT count(DISTINCT visitor_key) FROM analytics_events WHERE event_name='signup_completed') signups,
  (SELECT count(DISTINCT visitor_key) FROM analytics_events WHERE event_name='case_created') cases_created,
  (SELECT count(DISTINCT visitor_key) FROM analytics_events WHERE event_name='engaged' AND created_at>=now()-interval '30 days') engaged_30d,
  (SELECT count(DISTINCT visitor_key) FROM analytics_events WHERE event_name='signup_completed' AND created_at>=now()-interval '30 days') signups_30d`);
 const top=await db.query(`SELECT path,count(*) views FROM analytics_events WHERE event_name='page_view' AND created_at>=now()-interval '30 days' GROUP BY path ORDER BY views DESC LIMIT 10`);
 const returning=await db.query(`SELECT count(*) total FROM (SELECT visitor_id FROM visitor_sessions GROUP BY visitor_id HAVING min(first_seen_at)<now()-interval '30 days' AND max(last_seen_at)>=now()-interval '30 days') x`);
 res.json({...rows[0],returning_visitors:Number(returning.rows[0]?.total||0),top_pages:top.rows});
}