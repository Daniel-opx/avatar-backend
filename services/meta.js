const {randomUUID}=require('node:crypto');
const {AccessError}=require('./team');
const {uuid}=require('./supabase-auth');
const {fingerprint}=require('./approvals');
const {validateSpec,buildOperation,mockId,stages}=require('./meta-mock');
const safety={mode:'mock',real_campaign_created:false,real_spend_minor:0,activation_authorized:false};
function createMetaService(pool,team,{schema='public',allowMock=false,provider=null}={}){
  if(!/^[a-z][a-z0-9_]*$/.test(schema))throw new Error('Invalid schema');
  const available=()=>allowMock&&provider?.mode==='mock';
  async function tx(work){
    const client=await pool.connect();let broken;
    const run=(sql,values)=>client.query(sql.replaceAll('public.',schema+'.'),values);
    try{await run('BEGIN');const result=await work(run);await run('COMMIT');return result;}
    catch(e){try{await run('ROLLBACK');}catch(r){broken=r;}throw e.code==='23505'?new AccessError(409):e;}
    finally{client.release(broken);}
  }
  async function configuration(run){return (await run('SELECT * FROM public.meta_config WHERE id=1 FOR UPDATE')).rows[0];}
  async function content(run,jobId,approvalId){
    if(!(await run('SELECT p.job_id FROM public.job_processing p JOIN public.jobs j ON j.id=p.job_id WHERE p.job_id=$1 FOR UPDATE OF p,j',[jobId])).rowCount)throw new AccessError(404);
    const approval=(await run('SELECT * FROM public.approval_requests WHERE id=$1 AND job_id=$2 FOR UPDATE',[approvalId,jobId])).rows[0];
    const snapshot=(await run('SELECT public.approval_snapshot($1) AS s',[jobId])).rows[0].s;
    if(!approval||approval.state!=='approved'||!snapshot?.ready||snapshot.media?.mode!=='mock'||fingerprint(snapshot)!==approval.snapshot_hash)throw new AccessError(409);
    return {approval,snapshot};
  }
  async function load(run,id){
    const row=(await run('SELECT * FROM public.meta_drafts WHERE id=$1',[id])).rows[0];if(!row)throw new AccessError(404);
    const current=await content(run,row.job_id,row.approval_id);
    const draft=(await run('SELECT * FROM public.meta_drafts WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(fingerprint(draft.spec)!==draft.spec_hash||draft.content_hash!==current.approval.snapshot_hash)throw new AccessError(409);
    return {...current,draft};
  }
  const ops=async(run,id)=>(await run(`SELECT id,stage,state,external_id,error_code,checks,next_check_at,last_status
    FROM public.meta_operations WHERE draft_id=$1 ORDER BY created_at`,[id])).rows;
  async function propose(actor,jobId,{request_key:key,approval_id:approvalId,spec:input}={}){
    if(![jobId,key,approvalId].every(uuid))throw new AccessError(400);
    const spec=validateSpec(input),hash=fingerprint(spec);jobId=jobId.toLowerCase();key=key.toLowerCase();approvalId=approvalId.toLowerCase();
    return tx(async run=>{
      await team.authorize(run,actor,['admin','operator']);if(!available())return {status:'disabled',...safety};
      const {approval}=await content(run,jobId,approvalId);
      const cfg=await configuration(run);if(!cfg?.enabled)return {status:'disabled',...safety};
      const old=(await run('SELECT * FROM public.meta_drafts WHERE id=$1 OR (approval_id=$2 AND spec_hash=$3)',[key,approvalId,hash])).rows;
      if(old.length){if(old.length!==1||old[0].job_id!==jobId||old[0].approval_id!==approvalId||old[0].spec_hash!==hash)throw new AccessError(409);
        return {id:old[0].id,spec_hash:hash,status:'draft',replay:true,...safety};}
      if(Date.parse(spec.start_time)<=Date.now()||cfg.drafts_used>=cfg.max_drafts||spec.lifetime_budget_minor>cfg.max_lifetime_minor)throw new AccessError(409);
      await run(`INSERT INTO public.meta_drafts(id,job_id,approval_id,content_hash,spec,spec_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [key,jobId,approvalId,approval.snapshot_hash,spec,hash,actor.id]);
      await run('UPDATE public.meta_config SET drafts_used=drafts_used+1 WHERE id=1');
      await team.audit(run,actor,'mock_meta_draft_proposed',jobId,{draft_id:key,spec_hash:hash,lifetime_budget_minor:spec.lifetime_budget_minor,currency:spec.currency});
      return {id:key,spec_hash:hash,status:'draft',...safety};
    });
  }
  async function detail(actor,id){
    if(!uuid(id))throw new AccessError(400);
    return tx(async run=>{
      await team.authorize(run,actor,['admin','operator','reviewer']);
      const d=(await run('SELECT id,job_id,approval_id,spec,spec_hash,created_at FROM public.meta_drafts WHERE id=$1',[id])).rows[0];if(!d)throw new AccessError(404);
      const decisions=(await run('SELECT kind,spec_hash,approved_by,created_at FROM public.meta_decisions WHERE draft_id=$1',[id])).rows;
      return {...d,decisions,operations:await ops(run,id),...safety};
    });
  }
  async function decide(actor,id,kind,{request_key:key,expected_hash:hash,confirmation}={}){
    if(![id,key].every(uuid)||!['budget','activation'].includes(kind)||!/^[a-f0-9]{64}$/.test(hash||'')
      ||confirmation!==(kind==='budget'?'APPROVE_MOCK_BUDGET':'REVIEW_MOCK_ACTIVATION'))throw new AccessError(400);
    return tx(async run=>{
      await team.authorize(run,actor,['admin']);if(!available())return {status:'disabled',...safety};
      const {draft}=await load(run,id),cfg=await configuration(run);if(!cfg?.enabled)return {status:'disabled',...safety};
      if(draft.spec_hash!==hash||draft.spec.lifetime_budget_minor>cfg.max_lifetime_minor||Date.parse(draft.spec.end_time)<=Date.now())throw new AccessError(409);
      const old=(await run('SELECT * FROM public.meta_decisions WHERE id=$1 OR (draft_id=$2 AND kind=$3)',[key,id,kind])).rows;
      if(old.length){if(old.length!==1||old[0].draft_id!==id.toLowerCase()||old[0].kind!==kind||old[0].spec_hash!==hash)throw new AccessError(409);return {status:'reviewed',replay:true,...safety};}
      if(kind==='activation'){
        const rows=await ops(run,id);
        if(rows.length!==4||rows.some(r=>r.state!=='succeeded'||r.error_code)||!(await run("SELECT id FROM public.meta_decisions WHERE draft_id=$1 AND kind='budget' AND spec_hash=$2",[id,hash])).rowCount)throw new AccessError(409);
      }
      await run('INSERT INTO public.meta_decisions(id,draft_id,kind,spec_hash,approved_by) VALUES($1,$2,$3,$4,$5)',[key,id,kind,hash,actor.id]);
      await team.audit(run,actor,'mock_meta_'+kind+'_reviewed',draft.job_id,{draft_id:id,spec_hash:hash});
      return {status:'reviewed',...safety};
    });
  }
  async function advance(actor,id){
    if(!uuid(id))throw new AccessError(400);
    const work=await tx(async run=>{
      await team.authorize(run,actor,['admin','operator']);if(!available())return {status:'disabled',...safety};
      const {draft,snapshot}=await load(run,id),cfg=await configuration(run);
      if(!cfg?.enabled)return {status:'disabled',...safety};
      if(draft.spec.lifetime_budget_minor>cfg.max_lifetime_minor||Date.parse(draft.spec.end_time)<=Date.now()
        ||!(await run("SELECT id FROM public.meta_decisions WHERE draft_id=$1 AND kind='budget' AND spec_hash=$2",[id,draft.spec_hash])).rowCount)throw new AccessError(409);
      const rows=await ops(run,id),ids={};
      for(const stage of stages){
        const prior=rows.find(r=>r.stage===stage);
        if(prior){
          if(prior.state==='succeeded'&&!prior.error_code){ids[stage]=prior.external_id;continue;}
          if(prior.state==='succeeded')return {status:'reconciliation_required',operation_id:prior.id,...safety};
          if(prior.state==='submitting')await run("UPDATE public.meta_operations SET state='needs_reconciliation',error_code='META_OUTCOME_UNKNOWN' WHERE id=$1 AND lease_until<=clock_timestamp()",[prior.id]);
          return {status:(await ops(run,id)).find(r=>r.id===prior.id).state,operation_id:prior.id,...safety};
        }
        const payload=buildOperation(stage,draft.spec,snapshot,ids),op=randomUUID(),token=randomUUID();
        await run(`INSERT INTO public.meta_operations(id,draft_id,stage,state,payload,token,lease_until)
          VALUES($1,$2,$3,'submitting',$4,$5,clock_timestamp()+interval '30 seconds')`,[op,id,stage,payload,token]);
        await team.audit(run,actor,'mock_meta_operation_reserved',draft.job_id,{draft_id:id,operation_id:op,stage});
        return {status:'reserved',id:op,token,stage,payload,account:draft.spec.account_id};
      }
      return {status:'paused',...safety};
    });
    if(work.status!=='reserved')return work;
    let result,errorCode;
    try{result=await provider.create({...work,signal:AbortSignal.timeout(8000)});if(!mockId(result?.id))throw new Error();}
    catch(e){errorCode=['META_RATE_LIMITED','META_REJECTED','META_INVALID_RESPONSE'].includes(e.code)?e.code:'META_OUTCOME_UNKNOWN';}
    return tx(async run=>{
      const r=(await run(`UPDATE public.meta_operations SET state=$3,external_id=$4,error_code=$5,last_status=$6,
        updated_at=clock_timestamp() WHERE id=$1 AND token=$2 AND state IN ('submitting','needs_reconciliation') RETURNING id`,
        [work.id,work.token,errorCode?'needs_reconciliation':'succeeded',errorCode?null:result.id,errorCode||null,
          errorCode?null:work.stage==='creative'?'ASSET':'PAUSED'])).rows[0];
      return {status:r?(errorCode?'needs_reconciliation':'prepared'):'stale',operation_id:work.id,stage:work.stage,...safety};
    });
  }
  async function reconcile(actor,id,operationId){
    if(![id,operationId].every(uuid))throw new AccessError(400);
    const work=await tx(async run=>{
      await team.authorize(run,actor,['admin','operator']);if(!available())return {status:'disabled',...safety};
      if(!(await configuration(run))?.enabled)return {status:'disabled',...safety};
      const r=(await run('SELECT *,next_check_at<=clock_timestamp() AS due FROM public.meta_operations WHERE id=$1 AND draft_id=$2 FOR UPDATE',[operationId,id])).rows[0];if(!r)throw new AccessError(404);
      if(!r.external_id)return {status:'manual_reconciliation_required',...safety};
      if(!r.due)return {status:'not_due',...safety};if(r.checks>=3)return {status:'check_limit',...safety};
      const token=randomUUID();await run("UPDATE public.meta_operations SET token=$2,checks=checks+1,next_check_at=clock_timestamp()+interval '30 seconds' WHERE id=$1",[r.id,token]);
      return {...r,token,status:'reserved'};
    });if(work.status!=='reserved')return work;
    let errorCode=null,retryAfter=30;
    try{await provider.inspect({id:work.external_id,stage:work.stage,signal:AbortSignal.timeout(8000)});}
    catch(e){errorCode=['META_RATE_LIMITED','META_UNEXPECTED_STATUS','META_REJECTED'].includes(e.code)?e.code:'META_STATUS_UNAVAILABLE';retryAfter=Math.min(3600,Math.max(30,e.retryAfter||30));}
    return tx(async run=>{
      const saved=await run(`UPDATE public.meta_operations SET error_code=$3,next_check_at=clock_timestamp()+$4*interval '1 second',
        last_status=$5,updated_at=clock_timestamp() WHERE id=$1 AND token=$2`,[work.id,work.token,errorCode,retryAfter,errorCode?null:work.stage==='creative'?'ASSET':'PAUSED']);
      return {status:!saved.rowCount?'stale':errorCode?'status_unavailable':'verified_paused',error_code:errorCode,...safety};
    });
  }
  async function activate(actor,id){
    if(!uuid(id))throw new AccessError(400);
    return tx(async run=>{await team.authorize(run,actor,['admin']);
      await team.audit(run,actor,'meta_activation_blocked',null,{draft_id:id});
      return {status:'activation_locked',...safety};
    });
  }
  return {propose,detail,decide,advance,reconcile,activate};
}
module.exports={createMetaService};
