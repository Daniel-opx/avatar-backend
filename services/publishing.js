const {randomUUID}=require('node:crypto');
const {fingerprint}=require('./approvals');
const {AccessError}=require('./team');
const {uuid}=require('./supabase-auth');
const {buildPost,mockId}=require('./ghl-mock');
function createPublishingService(pool,team,{schema='public',allowMock=false,provider=null}={}){
  if(!/^[a-z][a-z0-9_]*$/.test(schema))throw new Error('Invalid schema');
  const q=s=>s.replaceAll('public.',schema+'.');
  const available=()=>allowMock&&provider?.mode==='mock';
  async function tx(work){const c=await pool.connect();let broken;const run=(s,v)=>c.query(q(s),v);
    try{await run('BEGIN');const result=await work(run);await run('COMMIT');return result;}
    catch(e){try{await run('ROLLBACK');}catch(r){broken=r;}throw e.code==='23505'?new AccessError(409):e;}finally{c.release(broken);}
  }
  const visible=r=>({id:r.id,approval_id:r.approval_id,account_id:r.account_id,state:r.state,mode:'mock',
    external_post_id:r.external_post_id,error_code:r.error_code,published_at:r.published_at,created_at:r.created_at,
    publication_authorized:false,real_post_created:false});
  async function history(actor,jobId){if(!uuid(jobId))throw new AccessError(400);
    return tx(async run=>{await team.authorize(run,actor,['admin','operator','reviewer']);
      return (await run('SELECT * FROM public.publishing_requests WHERE job_id=$1 ORDER BY created_at DESC LIMIT 50',[jobId])).rows.map(visible);
    });
  }
  async function accounts(actor){return tx(async run=>{await team.authorize(run,actor,['admin','operator','reviewer']);
    const cfg=(await run('SELECT enabled FROM public.publishing_config WHERE id=1')).rows[0];
    return {mode:'mock',available:Boolean(available()&&cfg?.enabled),real_publishing_enabled:false,
      accounts:(await run('SELECT id,label,platform FROM public.publishing_accounts WHERE enabled ORDER BY label')).rows};
  });}
  async function submit(actor,jobId,{request_key:key,approval_id:approvalId,account_id:accountId,schedule_date:scheduleDate=null}={}){
    if(![jobId,key,approvalId].every(uuid)||!mockId(accountId))throw new AccessError(400);
    if(!available())return {status:'disabled',real_post_created:false};
    jobId=jobId.toLowerCase();key=key.toLowerCase();approvalId=approvalId.toLowerCase();
    const work=await tx(async run=>{
      await team.authorize(run,actor,['admin','operator']);
      const job=await run('SELECT p.job_id FROM public.job_processing p JOIN public.jobs j ON j.id=p.job_id WHERE p.job_id=$1 FOR UPDATE OF p,j',[jobId]);if(!job.rowCount)throw new AccessError(404);
      const approval=(await run('SELECT * FROM public.approval_requests WHERE id=$1 AND job_id=$2 FOR UPDATE',[approvalId,jobId])).rows[0];
      const snapshot=(await run('SELECT public.approval_snapshot($1) AS s',[jobId])).rows[0].s;
      if(!approval||approval.state!=='approved'||snapshot?.ready!==true||fingerprint(snapshot)!==approval.snapshot_hash)throw new AccessError(409);
      const cfg=(await run('SELECT * FROM public.publishing_config WHERE id=1 FOR UPDATE')).rows[0];
      if(!cfg?.enabled)return {status:'disabled'};
      if(!(await run('SELECT id FROM public.publishing_accounts WHERE id=$1 AND enabled',[accountId])).rowCount)throw new AccessError(400);
      const prior=(await run('SELECT * FROM public.publishing_requests WHERE id=$1 OR (approval_id=$2 AND account_id=$3)',[key,approvalId,accountId])).rows;
      let payload;try{payload=buildPost(snapshot,accountId,cfg.user_id,scheduleDate,{allowPast:prior.length>0});}catch{throw new AccessError(400);}
      if(prior.length){const old=prior[0];if(prior.length!==1||old.approval_id!==approvalId||old.account_id!==accountId||fingerprint(old.payload)!==fingerprint(payload))throw new AccessError(409);
        if(old.state==='submitting'&&new Date(old.lease_until)<=new Date()){
          await run("UPDATE public.publishing_requests SET state='needs_reconciliation',error_code='SUBMISSION_UNCERTAIN' WHERE id=$1",[old.id]);old.state='needs_reconciliation';
        }
        return {status:old.state,...visible(old),replay:true};
      }
      if(cfg.submissions_used>=cfg.max_submissions)throw new AccessError(409);
      const token=randomUUID();
      await run(`INSERT INTO public.publishing_requests(id,job_id,approval_id,account_id,snapshot_hash,location_id,payload,state,token,lease_until)
        VALUES($1,$2,$3,$4,$5,$6,$7,'submitting',$8,clock_timestamp()+interval '30 seconds')`,[key,jobId,approvalId,accountId,approval.snapshot_hash,cfg.location_id,payload,token]);
      await run('UPDATE public.publishing_config SET submissions_used=submissions_used+1 WHERE id=1');
      await team.audit(run,actor,'mock_publication_reserved',jobId,{request_id:key,approval_id:approvalId});
      return {status:'reserved',id:key,token,location:cfg.location_id,payload};
    });
    if(work.status!=='reserved')return work;
    let result;try{result=await provider.submit({location:work.location,payload:work.payload,signal:AbortSignal.timeout(8000)});
      if(!mockId(result?.id)||!['submitted','scheduled','published','failed'].includes(result.state))throw new Error();
    }catch{return tx(async run=>{await run("UPDATE public.publishing_requests SET state='needs_reconciliation',error_code='SUBMISSION_UNCERTAIN',updated_at=clock_timestamp() WHERE id=$1 AND token=$2",[work.id,work.token]);return {status:'needs_reconciliation',real_post_created:false};});}
    return tx(async run=>{const r=(await run(`UPDATE public.publishing_requests SET external_post_id=$3,state=$4,published_at=$5,
      updated_at=clock_timestamp() WHERE id=$1 AND token=$2 AND state IN ('submitting','needs_reconciliation') RETURNING *`,[work.id,work.token,result.id,result.state,result.publishedAt||null])).rows[0];
      return r?{status:r.state,...visible(r)}:{status:'stale',real_post_created:false};
    });
  }
  async function reconcile(actor,jobId,id){
    if(![jobId,id].every(uuid))throw new AccessError(400);if(!available())return {status:'disabled'};
    const work=await tx(async run=>{await team.authorize(run,actor,['admin','operator']);
      if(!(await run('SELECT enabled FROM public.publishing_config WHERE id=1')).rows[0]?.enabled)return {status:'disabled'};
      const r=(await run('SELECT *,next_check_at<=clock_timestamp() AS due FROM public.publishing_requests WHERE id=$1 AND job_id=$2 FOR UPDATE',[id,jobId])).rows[0];if(!r)throw new AccessError(404);
      if(!r.external_post_id)return {status:'needs_reconciliation'};
      if(['published','failed'].includes(r.state))return {status:r.state,...visible(r)};
      if(!r.due)return {status:'not_due'};if(r.checks>=60)return {status:'check_limit'};
      const token=randomUUID();await run(`UPDATE public.publishing_requests SET token=$2,checks=checks+1,
        next_check_at=clock_timestamp()+interval '30 seconds' WHERE id=$1`,[id,token]);return {...r,token,status:'reserved'};
    });if(work.status!=='reserved')return work;
    let result;try{result=await provider.inspect({location:work.location_id,id:work.external_post_id,signal:AbortSignal.timeout(8000)});
      if(result?.id!==work.external_post_id||!['submitted','scheduled','published','failed'].includes(result.state))throw new Error();
    }catch{return {status:'status_unavailable',real_post_created:false};}
    return tx(async run=>{const r=(await run(`UPDATE public.publishing_requests SET state=$3,published_at=COALESCE($4,published_at),
      error_code=NULL,updated_at=clock_timestamp() WHERE id=$1 AND token=$2 RETURNING *`,[id,work.token,result.state,result.publishedAt||null])).rows[0];
      return r?{status:r.state,...visible(r)}:{status:'stale'};
    });
  }
  return {history,accounts,submit,reconcile};
}
module.exports={createPublishingService};
