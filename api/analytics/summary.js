import { db } from 'hatchable';
export const access='admin';
export const methods=['GET'];
export default async function(req,res){
 const [u,v,s,d,c]=await Promise.all([
  db.query('SELECT count(*)::int AS n FROM users'),
  db.query('SELECT count(DISTINCT visitor_id)::int AS n FROM visitor_sessions'),
  db.query('SELECT count(DISTINCT visitor_id)::int AS n FROM visitor_sessions WHERE last_seen_at >= now()-interval \'24 hours\''),
  db.query('SELECT count(*)::int AS n FROM visitor_sessions WHERE last_seen_at >= now()-interval \'24 hours\''),
  db.query('SELECT count(*)::int AS n FROM cases')
 ]);
 res.json({registered_users:u.rows[0].n,unique_visitors:v.rows[0].n,unique_visitors_24h:s.rows[0].n,sessions_24h:d.rows[0].n,cases:c.rows[0].n});
}