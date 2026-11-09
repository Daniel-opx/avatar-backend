// Explicit operator command only; never called by server startup or deployment.
require('dotenv').config({quiet:true});
const {uuid}=require('../services/supabase-auth');
const pool=require('../db/pool');
async function main(){
  const [id,confirm]=process.argv.slice(2);
  if(!uuid(id)||confirm!=='--confirm-first-admin')throw new Error('Usage: node scripts/bootstrap-team-admin.js <existing-supabase-user-uuid> --confirm-first-admin');
  const c=await pool.connect();try{
    await c.query('BEGIN');await c.query('LOCK TABLE public.team_members IN SHARE ROW EXCLUSIVE MODE');
    if((await c.query('SELECT 1 FROM public.team_members LIMIT 1')).rowCount)throw new Error('Team already exists; use an authenticated administrator');
    if(!(await c.query('SELECT id FROM auth.users WHERE id=$1',[id])).rowCount)throw new Error('Existing Supabase user not found');
    await c.query("INSERT INTO public.team_members(id,role) VALUES($1,'admin')",[id]);
    await c.query("INSERT INTO public.audit_events(actor_id,actor_kind,action,target_id) VALUES($1,'bootstrap','first_admin',$1)",[id]);
    await c.query('COMMIT');console.log('First administrator registered; authentication activation flags were not changed.');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;}).finally(()=>pool.end());
