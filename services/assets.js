const { StepError }=require('./processing');
const { identifier,validReference,validMetadata,validSignedURL }=require('./asset-validation');

function createAssetService(pool,{schema='public',allowPreparation=false,storage=null,tts=null}={}) {
  if(!/^[a-z][a-z0-9_]*$/.test(schema))throw new Error('Invalid schema');
  const q=s=>s.replaceAll('public.',`${schema}.`);
  const query=(s,v)=>pool.query(q(s),v);
  const fail=(code,options)=>{throw new StepError(code,options);};
  async function tx(work){
    const c=await pool.connect();let broken;
    const run=(s,v)=>c.query(q(s),v);
    try{await run('BEGIN');const result=await work(run);await run('COMMIT');return result;}
    catch(e){try{await run('ROLLBACK');}catch(rollback){broken=rollback;}throw e;}
    finally{c.release(broken);}
  }
  const config=async()=> (await query('SELECT * FROM public.asset_config WHERE id=1')).rows[0];
  async function verify(asset,cfg,signal){
    if(!validReference(asset) || asset.bucket!==cfg.storage_bucket || !validMetadata(asset.kind,asset))fail('INVALID_ASSET');
    if(asset.state && asset.state!=='ready')fail('ASSET_UNAVAILABLE');
    if(asset.expires_at && (!Number.isFinite(Date.parse(asset.expires_at)) || Date.parse(asset.expires_at)<=Date.now()+300000))fail('ASSET_EXPIRED');
    if(!storage)fail('STORAGE_UNCONFIGURED');
    let found;
    try{found=await storage.stat({bucket:asset.bucket,object_key:asset.object_key,signal});}
    catch{fail('ASSET_STORAGE_UNAVAILABLE',{transient:true});}
    if(!validMetadata(asset.kind,found) || found.mime_type!==asset.mime_type ||
      Number(found.size_bytes)!==Number(asset.size_bytes) || found.sha256!==asset.sha256)fail('ASSET_METADATA_MISMATCH');
    return asset;
  }
  async function register(jobId,revision,ref,{signal}={}){
    const keys=['kind','bucket','object_key','mime_type','size_bytes','sha256','expires_at'];
    if(!ref || Object.keys(ref).some(k=>!keys.includes(k)) || !Number.isSafeInteger(revision) || revision<1 ||
      !validReference(ref) || !validMetadata(ref.kind,ref) ||
      (ref.expires_at!=null && (!Number.isFinite(Date.parse(ref.expires_at)) || Date.parse(ref.expires_at)<=Date.now()+300000)))return {status:'invalid'};
    const cfg=await config();
    // Only mock adapters are allowed in this milestone; real upload/verification is deferred.
    if(!allowPreparation || !cfg?.enabled || storage?.mode!=='mock')return {status:'unconfigured'};
    await verify(ref,cfg,signal);
    return tx(async run=>{
      const job=(await run(`SELECT p.* FROM public.job_processing p JOIN public.jobs j ON j.id=p.job_id
        WHERE p.job_id=$1 AND p.content_revision=$2 AND j.status='draft'
        FOR UPDATE OF p,j`,[jobId,revision])).rows[0];
      if(!job)return {status:'not_found'};
      if(job.stage!=='assets' || !['queued','retry_wait','failed'].includes(job.state))return {status:'conflict'};
      const prior=(await run('SELECT * FROM public.job_assets WHERE job_id=$1 AND revision=$2 AND bucket=$3 AND object_key=$4',
        [jobId,revision,ref.bucket,ref.object_key])).rows[0];
      if(prior){
        const same=prior.kind===ref.kind && prior.mime_type===ref.mime_type && Number(prior.size_bytes)===Number(ref.size_bytes) &&
          prior.sha256===ref.sha256 && (prior.expires_at?.toISOString()||null)===(ref.expires_at?new Date(ref.expires_at).toISOString():null);
        return same?{status:'registered',id:prior.id,replay:true}:{status:'conflict'};
      }
      const count=await run('SELECT count(*)::integer AS count FROM public.job_assets WHERE job_id=$1 AND revision=$2',[jobId,revision]);
      if(count.rows[0].count>=20)return {status:'conflict'};
      const saved=await run(`INSERT INTO public.job_assets(job_id,revision,kind,bucket,object_key,mime_type,size_bytes,sha256,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [jobId,revision,ref.kind,ref.bucket,ref.object_key,ref.mime_type,ref.size_bytes,ref.sha256,ref.expires_at||null]);
      return {status:'registered',id:saved.rows[0].id};
    });
  }
  async function prepare(context){
    const cfg=await config();
    if(!allowPreparation || !cfg?.enabled)fail('ASSETS_DISABLED');
    if(!identifier(cfg.avatar_id) || !identifier(cfg.voice_id))fail('AVATAR_VOICE_UNCONFIGURED');
    const version=(await query(`SELECT v.package FROM public.content_versions v JOIN public.job_processing p ON p.job_id=v.job_id
      WHERE v.job_id=$1 AND v.revision=$2 AND p.content_revision=v.revision AND p.stage='assets'
      AND p.state='running' AND p.lease_token=$3 AND p.lease_until>clock_timestamp()`,
    [context.jobId,context.revision,context.leaseToken])).rows[0];
    if(!version)fail('ASSETS_STALE');
    const refs=(await query("SELECT * FROM public.job_assets WHERE job_id=$1 AND revision=$2 ORDER BY created_at,id",[context.jobId,context.revision])).rows;
    for(const ref of refs)await verify(ref,cfg,context.signal);
    let audio=null;
    if(cfg.voice_mode==='external_mock'){
      if(tts?.mode!=='mock' || storage?.mode!=='mock')fail('TTS_UNCONFIGURED');
      // A real TTS adapter needs a durable request journal before it may be enabled.
      try{audio=await tts.synthesize({script:version.package.script,voiceId:cfg.voice_id,
        operationKey:`${context.jobId}:voice:${context.revision}`,signal:context.signal});}
      catch{fail('MOCK_TTS_FAILED',{transient:true});}
      if(audio?.kind!=='audio')fail('INVALID_VOICE_ASSET');
      await verify(audio,cfg,context.signal);
    }
    return {version:1,mode:'mock',content_revision:context.revision,avatar_id:cfg.avatar_id,
      voice:{mode:cfg.voice_mode,voice_id:cfg.voice_id,audio:audio?{
        kind:audio.kind,bucket:audio.bucket,object_key:audio.object_key,mime_type:audio.mime_type,
        size_bytes:Number(audio.size_bytes),sha256:audio.sha256,expires_at:audio.expires_at||null}:null},
      script:version.package.script,visual_plan:version.package.visual_plan,media_ids:refs.map(r=>r.id)};
  }
  async function history(jobId){
    const [assets,manifests]=await Promise.all([
      query('SELECT * FROM public.job_assets WHERE job_id=$1 ORDER BY revision,created_at,id',[jobId]),
      query('SELECT revision,manifest,created_at FROM public.asset_manifests WHERE job_id=$1 ORDER BY revision',[jobId]),
    ]);return {assets:assets.rows,manifests:manifests.rows};
  }
  async function resolveForRender(jobId,revision,{signal}={}){
    const saved=(await query('SELECT manifest FROM public.asset_manifests WHERE job_id=$1 AND revision=$2',[jobId,revision])).rows[0];
    if(!saved)fail('ASSET_MANIFEST_MISSING');
    const cfg=await config();
    if(!allowPreparation || !cfg?.enabled)fail('ASSETS_DISABLED');
    const refs=(await query('SELECT * FROM public.job_assets WHERE job_id=$1 AND revision=$2 ORDER BY created_at,id',[jobId,revision])).rows;
    if(refs.length!==saved.manifest.media_ids.length || refs.some(r=>!saved.manifest.media_ids.includes(r.id)))fail('ASSET_MANIFEST_MISMATCH');
    if(saved.manifest.voice.audio)refs.push(saved.manifest.voice.audio);
    if(refs.length && storage?.mode!=='mock')fail('STORAGE_UNCONFIGURED');
    const media=[];
    for(const ref of refs){
      await verify(ref,cfg,signal);
      let signed;
      try{signed=await storage.sign({bucket:ref.bucket,object_key:ref.object_key,signal,ttlSeconds:900});}
      catch{fail('ASSET_SIGNING_FAILED',{transient:true});}
      if(!validSignedURL(signed?.url,cfg.storage_origin,ref,signed?.expiresAt))fail('INVALID_ASSET_URL');
      media.push({kind:ref.kind,url:signed.url,expires_at:signed.expiresAt});
    }
    // Short-lived URLs are returned only to the trusted renderer, never persisted or logged.
    return {manifest:saved.manifest,media};
  }
  async function expireReferences(){
    if(!allowPreparation || !(await config())?.enabled)return {status:'disabled'};
    return tx(async run=>{
      const result=await run(`WITH expired AS (SELECT id FROM public.job_assets WHERE state='ready'
        AND (expires_at<=clock_timestamp() OR created_at<clock_timestamp()-
          ((SELECT retention_days FROM public.asset_config WHERE id=1)*interval '1 day'))
        ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED)
        UPDATE public.job_assets SET state='expired' WHERE id IN (SELECT id FROM expired) RETURNING id`);
      return {status:'expired',count:result.rowCount};
    });
  }
  const handler={retrySafe:true,
    async isAvailable(run){if(!allowPreparation)return false;
      const cfg=(await run('SELECT * FROM public.asset_config WHERE id=1')).rows[0];
      return Boolean(cfg?.enabled && identifier(cfg.avatar_id) && identifier(cfg.voice_id));},
    run:prepare,
    async commit(run,row,output){
      if(output.content_revision!==row.content_revision || output.mode!=='mock')fail('ASSETS_STALE');
      const draft=await run("SELECT id FROM public.jobs WHERE id=$1 AND status='draft' FOR UPDATE",[row.job_id]);
      if(!draft.rowCount)fail('ASSETS_STALE');
      await run('INSERT INTO public.asset_manifests(job_id,revision,manifest) VALUES($1,$2,$3)',[row.job_id,row.content_revision,output]);
    },
  };
  return {register,prepare,history,resolveForRender,expireReferences,handler};
}
module.exports={createAssetService};
