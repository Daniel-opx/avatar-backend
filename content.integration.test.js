require('dotenv').config({quiet:true});
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');
const pool=require('./db/pool');
const {createContentService}=require('./services/content');
const {createProcessing}=require('./services/processing');
const {ProviderError}=require('./services/llm-provider');
const fixture=()=>({language:'he',script:'שלום, בואו לתכנן תוכן בעברית. רוצים לשמוע עוד?',caption:'תכנון תוכן בעברית',
  hashtags:['#תוכן'],visual_plan:[{description:'דמות מדברת',on_screen_text:'בואו לתכנן',duration_seconds:15}],
  claims:[],metadata:{tone:'נעים',audience:'בעלי עסקים',review_notes:['בדיקה אנושית נדרשת']}});

test('versioned content with real PostgreSQL and controlled providers',{
  skip:process.env.RUN_DB_TESTS!=='1',timeout:150000,
},async t=>{
  const schema=`step16_test_${randomUUID().replaceAll('-','')}`;
  const sql=(s,v)=>pool.query(s.replaceAll('public.',`${schema}.`),v);
  let job;
  let calls;
  let generate;
  const content=createContentService(pool,{schema,liveAllowed:true,providers:{openai:{generate:async args=>{
    calls++;return generate(args);
  }}}});
  const worker=createProcessing(pool,{content:content.handler},schema);
  const ok=()=>({content:fixture(),usage:{input:100,output:50},requestId:'controlled-request',model:'test-resolved'});
  const reset=async()=>{
    await sql('TRUNCATE public.jobs CASCADE');
    await sql("UPDATE public.processing_config SET enabled=true");
    await sql("UPDATE public.content_config SET enabled=true,provider='openai',model='test-model',prompt_version=1,requests_used=0,max_requests=20,input_usd_per_million=1,output_usd_per_million=2,verified_facts='[]'");
    job=(await sql("INSERT INTO public.jobs(topic) VALUES('תוכן בעברית') RETURNING id")).rows[0].id;
    calls=0;generate=ok;
  };
  const due=async()=>{
    await sql('UPDATE public.job_processing SET next_attempt_at=now()');
    await sql('UPDATE public.content_requests SET next_attempt_at=now()');
  };
  const state=async()=>(await sql('SELECT * FROM public.job_processing WHERE job_id=$1',[job])).rows[0];
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`CREATE TABLE ${schema}.jobs (LIKE public.jobs INCLUDING ALL)`);
    for (const file of ['20261106073647_durable_processing.sql','20261108184837_versioned_content.sql']) {
      await sql(readFileSync(`supabase/migrations/${file}`,'utf8'));
    }
    await t.test('default config cannot generate or consume a processing attempt',async()=>{
      job=(await sql("INSERT INTO public.jobs(topic) VALUES('תוכן בעברית') RETURNING id")).rows[0].id;
      await sql('UPDATE public.processing_config SET enabled=true');
      assert.equal((await worker.runOne()).status,'unconfigured');
      assert.equal((await state()).attempts,0);
      assert.equal((await sql('SELECT requests_used FROM public.content_config')).rows[0].requests_used,0);
    });
    await t.test('concurrent workers persist one validated package and atomically advance the content stage',async()=>{
      await reset();
      await Promise.all(Array.from({length:8},()=>worker.runOne()));
      assert.equal(calls,1);assert.equal((await state()).stage,'assets');
      const history=await content.history(job);
      assert.equal(history.versions.length,1);assert.equal(history.calls.length,1);
      assert.equal(history.calls[0].input_tokens,100);assert.equal(Number(history.calls[0].estimated_cost_usd),0.0002);
      assert.equal(history.calls[0].resolved_model,'test-resolved');
      const saved=(await sql('SELECT script,visual_plan,status FROM public.jobs WHERE id=$1',[job])).rows[0];
      assert.equal(saved.script,fixture().script);assert.deepEqual(saved.visual_plan,fixture().visual_plan);
      assert.equal(saved.status,'draft');
    });
    await t.test('regeneration is idempotent and retains old content versions',async()=>{
      const key=randomUUID();
      const results=await Promise.all(Array.from({length:6},()=>content.regenerate(job,key)));
      assert.ok(results.every(r=>r.revision===2));
      assert.equal((await content.history(job)).versions.length,1);
      assert.equal((await sql('SELECT script FROM public.jobs WHERE id=$1',[job])).rows[0].script,null);
      generate=()=>({...ok(),content:{...fixture(),script:'זוהי גרסה חדשה בעברית לתוכן שלנו.'}});
      assert.equal((await worker.runOne()).status,'advanced');
      const history=await content.history(job);
      assert.equal(history.versions.length,2);assert.equal(history.versions[0].package.script,fixture().script);
      assert.equal(history.calls[1].revision,2);assert.equal(calls,2);
    });
    await t.test('invalid content keeps job untouched while recording known usage',async()=>{
      await reset();generate=()=>({...ok(),content:{bad:'response'}});
      assert.equal((await worker.runOne()).status,'failed');
      const h=await content.history(job);assert.equal(h.versions.length,0);
      assert.equal(h.calls[0].error_code,'INVALID_CONTENT');assert.equal(h.calls[0].input_tokens,100);
      assert.equal((await sql('SELECT script FROM public.jobs WHERE id=$1',[job])).rows[0].script,null);
    });
    await t.test('explicit rate limits retry with a three-call ceiling',async()=>{
      await reset();generate=()=>{throw new ProviderError('PROVIDER_RATE_LIMIT',{retryable:true});};
      for(let i=1;i<=3;i++) {
        assert.equal((await worker.runOne()).status,i<3?'retry_wait':'failed');
        if(i<3){assert.equal((await worker.runOne()).status,'idle');await due();}
      }
      assert.equal(calls,3);assert.equal((await content.history(job)).calls.length,3);
      assert.equal((await sql('SELECT requests_used FROM public.content_config')).rows[0].requests_used,3);
    });
    await t.test('transport uncertainty is quarantined and cannot be regenerated or retried',async()=>{
      await reset();generate=()=>{throw new ProviderError('PROVIDER_TRANSPORT',{uncertain:true});};
      assert.equal((await worker.runOne()).status,'needs_reconciliation');
      assert.equal((await worker.control(job,'retry')).status,'conflict');
      assert.equal((await content.regenerate(job,randomUUID())).status,'conflict');
      assert.equal(calls,1);
    });
    await t.test('retries retain the original prompt/model/rates snapshot',async()=>{
      await reset();
      generate=()=>{throw new ProviderError('PROVIDER_RATE_LIMIT',{retryable:true});};
      await worker.runOne();
      await sql("INSERT INTO public.content_prompts(version,instructions) VALUES(2,'A new prompt version for a future request only.')");
      await sql("UPDATE public.content_config SET prompt_version=2,model='future-model',input_usd_per_million=99");
      generate=args=>{assert.equal(args.model,'test-model');assert.ok(args.instructions.includes('natural Hebrew'));return ok();};
      await due();assert.equal((await worker.runOne()).status,'advanced');
      const h=await content.history(job);assert.equal(h.calls[1].prompt_version,1);
      assert.equal(Number(h.calls[1].estimated_cost_usd),0.0002);
    });
    await t.test('aborted generation records an uncertain outcome without a saved draft',async()=>{
      await reset();
      const controller=new AbortController();
      generate=()=>{controller.abort();return ok();};
      const claim=await worker.claim();
      await assert.rejects(content.generate({jobId:job,revision:1,leaseToken:claim.row.lease_token,signal:controller.signal}),
        e=>e.reconcile===true && e.code==='PROVIDER_TIMEOUT');
      const h=await content.history(job);assert.equal(h.versions.length,0);
      assert.equal(h.calls[0].state,'needs_reconciliation');
    });
    await t.test('saved version is reused after checkpoint failure without another provider call',async()=>{
      await reset();
      const claim=await worker.claim();
      const context={jobId:job,revision:claim.row.content_revision,leaseToken:claim.row.lease_token};
      const output=await content.generate(context);
      await sql("ALTER TABLE public.job_processing ADD CONSTRAINT injected CHECK(stage='content')");
      await assert.rejects(worker.finish(claim.row,output),{code:'23514'});
      assert.equal((await sql('SELECT script FROM public.jobs WHERE id=$1',[job])).rows[0].script,null);
      assert.equal((await content.history(job)).versions.length,1);
      await sql('ALTER TABLE public.job_processing DROP CONSTRAINT injected');
      await sql("UPDATE public.job_processing SET lease_until=now()-interval '1 second' WHERE job_id=$1",[job]);
      await worker.runOne();await due();
      assert.equal((await worker.runOne()).status,'advanced');assert.equal(calls,1);
    });
    await t.test('restart with a reserved unfinished call does not resubmit it',async()=>{
      await reset();
      const claim=await worker.claim();
      const requestId=randomUUID();const token=randomUUID();
      await sql(`INSERT INTO public.content_requests(id,job_id,revision,state,token,provider,model,prompt_version,input_snapshot)
        VALUES($1,$2,1,'running',$3,'openai','test-model',1,'{}')`,[requestId,job,token]);
      await sql('INSERT INTO public.content_calls(token,request_id,attempt) VALUES($1,$2,1)',[token,requestId]);
      await sql("UPDATE public.job_processing SET lease_until=now()-interval '1 second' WHERE job_id=$1",[job]);
      await worker.runOne();await due();
      assert.equal((await worker.runOne()).status,'needs_reconciliation');assert.equal(calls,0);
      assert.equal((await worker.finish(claim.row,{})).status,'stale');
    });
    await t.test('global request allowance serializes competing jobs',async()=>{
      await reset();await sql('UPDATE public.content_config SET max_requests=1');
      await sql("INSERT INTO public.jobs(topic) VALUES('נושא נוסף')");
      await Promise.all(Array.from({length:8},()=>worker.runOne()));
      assert.equal(calls,1);
      assert.equal((await sql('SELECT requests_used FROM public.content_config')).rows[0].requests_used,1);
    });
    await t.test('regeneration refuses content after downstream work has begun or human review',async()=>{
      await reset();await worker.runOne();
      await sql("UPDATE public.job_processing SET attempts=1 WHERE job_id=$1",[job]);
      assert.equal((await content.regenerate(job,randomUUID())).status,'conflict');
      await sql("UPDATE public.jobs SET status='ready_for_review' WHERE id=$1",[job]);
      assert.equal((await content.regenerate(job,randomUUID())).status,'conflict');
    });
    await t.test('content tables have RLS and deny client reads',async()=>{
      const result=await pool.query(`SELECT c.relname,c.relrowsecurity,
        has_table_privilege('anon',c.oid,'SELECT') AS anon,
        has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=$1 AND c.relname LIKE $2 AND c.relkind='r'`,[schema,'content_%']);
      assert.equal(result.rows.length,6);
      assert.ok(result.rows.every(r=>r.relrowsecurity&&!r.anon&&!r.authenticated));
    });
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();
  }
});
