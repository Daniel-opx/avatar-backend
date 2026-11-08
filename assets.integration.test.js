require('dotenv').config({quiet:true});
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');
const pool=require('./db/pool');
const {createAssetService}=require('./services/assets');
const {createProcessing}=require('./services/processing');
test('asset preparation with isolated PostgreSQL and mock storage/voice',{
  skip:process.env.RUN_DB_TESTS!=='1',timeout:150000,
},async t=>{
  const schema=`step17_test_${randomUUID().replaceAll('-','')}`;
  const sql=(s,v)=>pool.query(s.replaceAll('public.',`${schema}.`),v);
  const objects=new Map();let job;let stat;let sign;let synthesize;let ttsCalls;
  const storage={mode:'mock',stat:args=>stat(args),sign:args=>sign(args)};
  const tts={mode:'mock',synthesize:args=>{ttsCalls++;return synthesize(args);}};
  const assets=createAssetService(pool,{schema,allowPreparation:true,storage,tts});
  const worker=createProcessing(pool,{assets:assets.handler},schema);
  const media=(kind='image')=>({kind,bucket:'private-media',object_key:`job/file.${kind==='image'?'png':'mp3'}`,
    mime_type:kind==='image'?'image/png':'audio/mpeg',size_bytes:1024,sha256:'a'.repeat(64),expires_at:null});
  const put=ref=>objects.set(ref.object_key,ref);
  const reset=async()=>{
    await sql('TRUNCATE public.jobs CASCADE');
    await sql("UPDATE public.processing_config SET enabled=true");
    await sql(`UPDATE public.asset_config SET enabled=true,avatar_id='mock-avatar',voice_id='mock-voice',
      voice_mode='builtin',storage_bucket='private-media',storage_origin='https://private.example',retention_days=30`);
    job=(await sql("INSERT INTO public.jobs(topic) VALUES('בדיקת נכסים') RETURNING id")).rows[0].id;
    const request=randomUUID();
    await sql(`INSERT INTO public.content_requests(id,job_id,revision,state,token,provider,model,prompt_version,input_snapshot)
      VALUES($1,$2,1,'succeeded',$3,'mock','mock-model',1,'{}')`,[request,job,randomUUID()]);
    await sql('INSERT INTO public.content_versions(job_id,revision,request_id,package) VALUES($1,1,$2,$3)',
      [job,request,{script:'תסריט עברי מדומה לבדיקה',visual_plan:[{description:'סצנה מדומה',on_screen_text:'הדגמה',duration_seconds:15}]}]);
    await sql("UPDATE public.job_processing SET stage='assets' WHERE job_id=$1",[job]);
    objects.clear();ttsCalls=0;
    stat=async({object_key})=>{if(!objects.has(object_key))throw new Error('private storage error');return objects.get(object_key);};
    sign=async({bucket,object_key})=>({url:`https://private.example/storage/v1/object/sign/${bucket}/${object_key}?token=private-signed-token`,
      expiresAt:new Date(Date.now()+900000).toISOString()});
    synthesize=async()=>{const audio=media('audio');put(audio);return audio;};
  };
  try{
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`CREATE TABLE ${schema}.jobs (LIKE public.jobs INCLUDING ALL)`);
    for(const file of ['20261106073647_durable_processing.sql','20261108184837_versioned_content.sql','20261108191748_asset_preparation.sql']){
      await sql(readFileSync(`supabase/migrations/${file}`,'utf8'));
    }
    await t.test('disabled configuration and production service do not claim work',async()=>{
      await reset();await sql('UPDATE public.asset_config SET enabled=false');
      assert.equal((await worker.runOne()).status,'unconfigured');
      const disabled=createAssetService(pool,{schema});
      assert.equal(await disabled.handler.isAvailable(),false);
      assert.equal((await disabled.register(job,1,media())).status,'unconfigured');
      assert.equal((await disabled.expireReferences()).status,'disabled');
    });
    await t.test('built-in voice requires no external TTS or storage and concurrent workers persist one manifest',async()=>{
      await reset();
      const builtin=createAssetService(pool,{schema,allowPreparation:true});
      const w=createProcessing(pool,{assets:builtin.handler},schema);
      await Promise.all(Array.from({length:8},()=>w.runOne()));
      const history=await builtin.history(job);
      assert.equal(history.manifests.length,1);assert.equal(ttsCalls,0);
      assert.equal(history.manifests[0].manifest.voice.mode,'builtin');
      assert.equal(history.manifests[0].manifest.voice.audio,null);
      assert.deepEqual((await builtin.resolveForRender(job,1)).media,[]);
      assert.equal((await sql('SELECT stage FROM public.job_processing WHERE job_id=$1',[job])).rows[0].stage,'render');
    });
    await t.test('private object registration is verified, idempotent and does not allow metadata replacement',async()=>{
      await reset();const ref=media();put(ref);
      const one=await assets.register(job,1,ref);const two=await assets.register(job,1,ref);
      assert.equal(one.status,'registered');assert.equal(two.id,one.id);assert.equal(two.replay,true);
      const modified={...ref,size_bytes:2048};put(modified);
      assert.equal((await assets.register(job,1,modified)).status,'conflict');put(ref);
      assert.equal((await worker.runOne()).status,'advanced');
      const result=await assets.resolveForRender(job,1);
      assert.equal(result.media.length,1);assert.ok(result.media[0].url.includes('private-signed-token'));
      assert.ok(!JSON.stringify(await assets.history(job)).includes('private-signed-token'));
      assert.ok(!JSON.stringify((await worker.history(job)).checkpoints).includes('private-signed-token'));
      assert.equal((await assets.register(job,1,ref)).status,'conflict');
    });
    await t.test('missing objects retry safely; MIME/hash mismatches fail permanently',async()=>{
      await reset();const ref=media();put(ref);await assets.register(job,1,ref);objects.clear();
      assert.equal((await worker.runOne()).status,'retry_wait');
      put({...ref,sha256:'b'.repeat(64)});
      await sql('UPDATE public.job_processing SET next_attempt_at=now() WHERE job_id=$1',[job]);
      assert.equal((await worker.runOne()).status,'failed');
      assert.equal((await assets.history(job)).manifests.length,0);
    });
    await t.test('per-revision media limit prevents an unbounded manifest',async()=>{
      await reset();const ref=media();put(ref);
      await sql(`INSERT INTO public.job_assets(job_id,revision,kind,bucket,object_key,mime_type,size_bytes,sha256)
        SELECT $1,1,'image','private-media','job/existing-'||n||'.png','image/png',1024,$2
        FROM generate_series(1,20) AS n`,[job,ref.sha256]);
      assert.equal((await assets.register(job,1,ref)).status,'conflict');
      assert.equal((await assets.history(job)).assets.length,20);
    });
    await t.test('expired media and forged links are rejected; tokens are regenerated just in time',async()=>{
      await reset();const ref=media();put(ref);await assets.register(job,1,ref);await worker.runOne();
      sign=async()=>({url:'https://evil.example/video.mp4?token=secret',expiresAt:new Date(Date.now()+900000).toISOString()});
      await assert.rejects(assets.resolveForRender(job,1),e=>e.code==='INVALID_ASSET_URL');
      sign=async({bucket,object_key})=>({url:`https://private.example/storage/v1/object/sign/${bucket}/${object_key}?token=fresh`,expiresAt:new Date(Date.now()+900000).toISOString()});
      assert.ok((await assets.resolveForRender(job,1)).media[0].url.endsWith('token=fresh'));
      await sql("UPDATE public.job_assets SET expires_at=now()-interval '1 second' WHERE job_id=$1",[job]);
      await assert.rejects(assets.resolveForRender(job,1),e=>e.code==='ASSET_EXPIRED');
    });
    await t.test('optional mock TTS uses a revision key and validates its audio output',async()=>{
      await reset();await sql("UPDATE public.asset_config SET voice_mode='external_mock'");
      synthesize=async args=>{assert.equal(args.operationKey,`${job}:voice:1`);const audio=media('audio');put(audio);return audio;};
      assert.equal((await worker.runOne()).status,'advanced');assert.equal(ttsCalls,1);
      const h=await assets.history(job);assert.equal(h.manifests[0].manifest.voice.audio.mime_type,'audio/mpeg');
      assert.equal((await assets.resolveForRender(job,1)).media[0].kind,'audio');
      await reset();await sql("UPDATE public.asset_config SET voice_mode='external_mock'");
      synthesize=async()=>({...media('audio'),mime_type:'text/html'});
      assert.equal((await worker.runOne()).status,'failed');
    });
    await t.test('manifest persistence rolls back with checkpoint advancement and stale workers cannot commit',async()=>{
      await reset();const claim=await worker.claim();
      const manifest=await assets.prepare({jobId:job,revision:1,leaseToken:claim.row.lease_token});
      await sql("ALTER TABLE public.job_processing ADD CONSTRAINT injected CHECK(stage='assets')");
      await assert.rejects(worker.finish(claim.row,manifest),{code:'23514'});
      assert.equal((await assets.history(job)).manifests.length,0);
      await sql('ALTER TABLE public.job_processing DROP CONSTRAINT injected');
      await sql("UPDATE public.job_processing SET lease_until=now()-interval '1 second' WHERE job_id=$1",[job]);
      assert.equal((await worker.finish(claim.row,manifest)).status,'stale');
      await worker.runOne();await sql('UPDATE public.job_processing SET next_attempt_at=now() WHERE job_id=$1',[job]);
      assert.equal((await worker.runOne()).status,'advanced');
      assert.equal((await assets.history(job)).manifests.length,1);
    });
    await t.test('retention expires metadata in bounded batches and never removes storage objects',async()=>{
      await reset();const ref=media();put(ref);await assets.register(job,1,ref);
      await sql("UPDATE public.job_assets SET created_at=now()-interval '31 days' WHERE job_id=$1",[job]);
      assert.equal((await assets.expireReferences()).count,1);
      assert.equal((await assets.history(job)).assets[0].state,'expired');
      assert.equal(objects.size,1);
    });
    await t.test('a job moved to review cannot commit a draft asset manifest',async()=>{
      await reset();const claim=await worker.claim();
      const manifest=await assets.prepare({jobId:job,revision:1,leaseToken:claim.row.lease_token});
      await sql("UPDATE public.jobs SET status='ready_for_review' WHERE id=$1",[job]);
      await assert.rejects(worker.finish(claim.row,manifest),e=>e.code==='ASSETS_STALE');
      assert.equal((await assets.history(job)).manifests.length,0);
    });
    await t.test('asset tables have RLS and deny direct client reads',async()=>{
      const result=await pool.query(`SELECT c.relname,c.relrowsecurity,
        has_table_privilege('anon',c.oid,'SELECT') AS anon,
        has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1
        AND c.relname=ANY($2::text[])`,[schema,['asset_config','job_assets','asset_manifests']]);
      assert.equal(result.rows.length,3);assert.ok(result.rows.every(r=>r.relrowsecurity&&!r.anon&&!r.authenticated));
    });
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
