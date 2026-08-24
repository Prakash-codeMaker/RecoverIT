import { db } from 'hatchable';
export const access='admin'; export const methods=['GET'];

export default async function(req,res){
  const cases=await db.query('SELECT status,count(*)::int count FROM recovery_cases GROUP BY status ORDER BY status');
  const test=await db.query("SELECT count(*)::int count FROM actions WHERE approval_state='TEST_ONLY'");

  const traffic=await db.query(`
    SELECT
      count(*) FILTER (WHERE created_at >= now()-interval '24 hours')::int AS signals_24h,
      count(DISTINCT visitor_id) FILTER (WHERE created_at >= now()-interval '24 hours' AND visitor_id IS NOT NULL)::int AS unique_visitors_24h,
      count(DISTINCT session_id) FILTER (WHERE created_at >= now()-interval '24 hours' AND session_id IS NOT NULL)::int AS sessions_24h,
      count(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL)::int AS unique_visitors_all_time,
      count(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)::int AS sessions_all_time,
      count(*) FILTER (WHERE event_name='page_view' AND created_at >= now()-interval '24 hours')::int AS page_views_24h,
      count(*) FILTER (WHERE event_name='case_created' AND created_at >= now()-interval '24 hours')::int AS case_creations_24h,
      count(*) FILTER (WHERE event_name='signup_complete' AND created_at >= now()-interval '24 hours')::int AS signups_24h
    FROM product_signals
  `);

  const users=await db.query("SELECT count(*)::int count, count(*) FILTER (WHERE created_at >= now()-interval '24 hours')::int new_24h FROM users");
  const cases24=await db.query("SELECT count(*)::int count FROM recovery_cases WHERE created_at >= now()-interval '24 hours'");
  const sources=await db.query(`
    SELECT coalesce(utm_source,'direct') source, count(DISTINCT visitor_id)::int visitors
    FROM product_signals
    WHERE created_at >= now()-interval '24 hours' AND visitor_id IS NOT NULL
    GROUP BY coalesce(utm_source,'direct')
    ORDER BY visitors DESC
    LIMIT 20
  `);

  res.json({
    cases_by_status:cases.rows,
    duplicate_or_test_actions:test.rows[0]?.count||0,
    traffic:{...traffic.rows[0],case_creations_24h:Math.max(Number(traffic.rows[0]?.case_creations_24h||0),Number(cases24.rows[0]?.count||0))},
    accounts:users.rows[0]||{count:0,new_24h:0},
    acquisition:sources.rows
  });
}