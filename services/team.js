const {randomBytes,timingSafeEqual}=require('node:crypto');
const {digest}=require('./webhook-auth');
const {createIdentityProvider,uuid}=require('./supabase-auth');
class AccessError extends Error{constructor(status){super('Access denied');this.status=status;}}
const matches=(raw,hash)=>typeof raw==='string'&&/^[A-Za-z0-9_-]{43}$/.test(raw)&&typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)
  &&timingSafeEqual(Buffer.from(digest(raw),'hex'),Buffer.from(hash,'hex'));
function createTeamService(pool,{schema='public',identitySchema='auth',provider=createIdentityProvider()}={}){
  if(![schema,identitySchema].every(s=>/^[a-z][a-z0-9_]*$/.test(s)))throw new Error('Invalid schema');
  const q=s=>s.replaceAll('public.',schema+'.');
  const query=(s,v)=>pool.query(q(s),v);
  async function tx(work){const c=await pool.connect();let broken;
    const run=(s,v)=>c.query(q(s),v);
    try{await run('BEGIN');const result=await work(run);await run('COMMIT');return result;}
    catch(e){try{await run('ROLLBACK');}catch(rollback){broken=rollback;}throw e;}finally{c.release(broken);}
  }
  const audit=(run,actor,action,target=null,detail={})=>run(`INSERT INTO public.audit_events(actor_id,actor_kind,action,target_id,detail)
    VALUES($1,$2,$3,$4,$5)`,[actor?.id||null,actor?.kind||'service',action,target,detail]);
  const active=`s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND m.enabled AND EXISTS(
    SELECT 1 FROM ${identitySchema}.sessions ps WHERE ps.id=s.provider_session_id AND ps.user_id=m.id
    AND (ps.not_after IS NULL OR ps.not_after>clock_timestamp()))`;
  async function lookup(token){
    if(!provider.enabled||typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
    const row=(await query(`SELECT m.id,m.role,s.csrf_hash,s.token_hash FROM public.team_sessions s
      JOIN public.team_members m ON m.id=s.member_id WHERE s.token_hash=$1 AND ${active}`,[digest(token)])).rows[0];
    return row?{kind:'human',id:row.id,role:row.role,sessionHash:row.token_hash,csrfHash:row.csrf_hash}:null;
  }
  async function authorize(run,actor,roles){
    if(actor?.kind!=='human'||!actor.sessionHash)throw new AccessError(401);
    const row=(await run(`SELECT m.id,m.role FROM public.team_sessions s JOIN public.team_members m ON m.id=s.member_id
      WHERE s.token_hash=$1 AND m.id=$2 AND ${active} FOR SHARE OF s,m`,[actor.sessionHash,actor.id])).rows[0];
    if(!row)throw new AccessError(401);if(!roles.includes(row.role))throw new AccessError(403);return row;
  }
  async function login(email,password){
    if(!provider.enabled)return {status:'disabled'};
    if(typeof email!=='string'||email.length>254||!email.includes('@')||typeof password!=='string'||password.length<1||password.length>1024)return {status:'invalid'};
    let identity;try{identity=await provider.login(email,password);}catch{return {status:'unavailable'};}
    if(!identity||!uuid(identity.id)||!uuid(identity.sessionId)||!Number.isFinite(+identity.expiresAt)||+identity.expiresAt<=Date.now())return {status:'unauthorized'};
    return tx(async run=>{
      const member=(await run(`SELECT m.id,m.role FROM public.team_members m WHERE m.id=$1 AND m.enabled AND EXISTS(
        SELECT 1 FROM ${identitySchema}.sessions WHERE id=$2 AND user_id=m.id AND (not_after IS NULL OR not_after>clock_timestamp())) FOR SHARE`,[identity.id,identity.sessionId])).rows[0];
      if(!member)return {status:'unauthorized'};
      const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
      const expiry=new Date(Math.min(Date.now()+30*60000,+identity.expiresAt));
      const inserted=await run(`INSERT INTO public.team_sessions(token_hash,member_id,provider_session_id,csrf_hash,expires_at)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(provider_session_id) DO NOTHING RETURNING token_hash`,[digest(token),member.id,identity.sessionId,digest(csrf),expiry]);
      if(!inserted.rowCount)return {status:'unauthorized'};
      await audit(run,{kind:'human',id:member.id},'session_login',member.id);
      return {status:'authenticated',token,csrf,user:member,expires_at:expiry};
    });
  }
  async function logout(token,csrf){
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return;
    return tx(async run=>{
      const s=(await run('SELECT * FROM public.team_sessions WHERE token_hash=$1 AND revoked_at IS NULL FOR UPDATE',[digest(token)])).rows[0];
      if(!s)return;if(!matches(csrf,s.csrf_hash))throw new AccessError(403);
      await run('UPDATE public.team_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[s.token_hash]);
      await audit(run,{kind:'human',id:s.member_id},'session_logout',s.member_id);
    });
  }
  async function listMembers(actor){return tx(async run=>{await authorize(run,actor,['admin']);return (await run('SELECT id,role,enabled,created_at FROM public.team_members ORDER BY created_at')).rows;});}
  async function setMember(actor,id,role,enabled){
    if(!uuid(id)||!['admin','operator','reviewer'].includes(role)||typeof enabled!=='boolean')throw new AccessError(400);
    return tx(async run=>{
      await run('LOCK TABLE public.team_members IN SHARE ROW EXCLUSIVE MODE');await authorize(run,actor,['admin']);
      const old=(await run('SELECT role,enabled FROM public.team_members WHERE id=$1',[id])).rows[0];
      if(old?.role==='admin'&&old.enabled&&(!enabled||role!=='admin')){
        const count=await run(`SELECT count(*)::int AS n FROM public.team_members m WHERE role='admin' AND enabled
          AND EXISTS(SELECT 1 FROM ${identitySchema}.users u WHERE u.id=m.id)`);if(count.rows[0].n<2)throw new AccessError(409);
      }
      if(!(await run(`SELECT id FROM ${identitySchema}.users WHERE id=$1`,[id])).rowCount&&(!old||enabled))throw new AccessError(404);
      await run(`INSERT INTO public.team_members(id,role,enabled) VALUES($1,$2,$3)
        ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,enabled=EXCLUDED.enabled`,[id,role,enabled]);
      if(!enabled)await run('UPDATE public.team_sessions SET revoked_at=clock_timestamp() WHERE member_id=$1 AND revoked_at IS NULL',[id]);
      await audit(run,actor,'member_updated',id,{role,enabled});return {id,role,enabled};
    });
  }
  async function recordAttempt(actor,target,action='job_operation_attempt'){return tx(async run=>{await authorize(run,actor,['admin','operator','reviewer']);await audit(run,actor,action,target);});}
  async function auditHistory(actor){return tx(async run=>{await authorize(run,actor,['admin']);return (await run('SELECT * FROM public.audit_events ORDER BY id DESC LIMIT 100')).rows;});}
  return {lookup,authorize,login,logout,listMembers,setMember,audit,matches,recordAttempt,auditHistory,enabled:provider.enabled};
}
module.exports={createTeamService,AccessError};
