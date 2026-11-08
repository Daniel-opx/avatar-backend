require('dotenv').config({quiet:true});
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');
const pool=require('./db/pool');
const {composePipeline}=require('./services/pipeline');
const {createContentService}=require('./services/content');
const {createAssetService}=require('./services/assets');
const {createRenderService}=require('./services/rendering');
const {createCompletionService}=require('./services/completion');
const {createMockHeyGen}=require('./services/heygen-mock');
const {createMockVideoStore}=require('./test-support/mock-video-store');
test('composed mock generation stops at retained-media human review',{
  skip:process.env.RUN_DB_TESTS!=='1',timeout:180000,
},async t=>{
  const schema=`step20_test_${randomUUID().replaceAll('-','')}`;
  const sql=(s,v)=>pool.query(s.replaceAll('public.',`${schema}.`),v);
  let job,calls,submits,inspections,store,provider,callbackId;
  const due=async()=>{
    for(const table of ['job_processing','render_requests','video_media']){
      const field={job_processing:'next_attempt_at',render_requests:'next_action_at',video_media:'next_check_at'}[table];
      await sql(`UPDATE public.${table} SET ${field}=clock_timestamp()`);
    }
  };
  const pipeline=()=>{
    const content=createContentService(pool,{schema,liveAllowed:true,providers:{openai:{async generate(){
      calls++;return {model:'mock',requestId:'mock_content',content:{language:'he',script:'שלום, זהו תסריט מדומה לבדיקת התהליך.',
        caption:'בדיקה בלבד',hashtags:['#בדיקה'],visual_plan:[{description:'דמות מדברת',on_screen_text:'הדגמה בלבד',duration_seconds:15}],
        claims:[],metadata:{tone:'נעים',audience:'בודקים',review_notes:['נדרשת בדיקה אנושית']}}};
    }}}});
    return composePipeline(pool,{content,assets:createAssetService(pool,{schema,allowPreparation:true}),
      rendering:createRenderService(pool,{schema,allowMock:true,provider}),
      completion:createCompletionService(pool,{schema,allowMock:true,provider,store}),
    },{schema});
  };
  async function reset(){
    await sql('TRUNCATE public.jobs CASCADE');calls=0;submits=0;inspections=0;store=createMockVideoStore();
    await sql('UPDATE public.processing_config SET enabled=true');
    await sql("UPDATE public.content_config SET enabled=true,provider='openai',model='mock',max_requests=1,requests_used=0");
    await sql("UPDATE public.asset_config SET enabled=true,avatar_id='mock-avatar',voice_id='mock-voice'");
    await sql('UPDATE public.render_config SET enabled=true,max_submissions=1,submissions_used=0,poll_after_seconds=5');
    await sql('UPDATE public.completion_config SET enabled=true');
    job=(await sql("INSERT INTO public.jobs(topic) VALUES('בדיקת תהליך מלאה מדומה') RETURNING id")).rows[0].id;
    provider=createMockHeyGen({transport:{mode:'mock',async request(url,options){
      if(options.method==='POST'){submits++;callbackId=JSON.parse(options.body).callback_id;}
      else inspections++;
      return new Response(JSON.stringify({data:{video_id:'mock_pipeline',callback_id:callbackId,status:options.method==='POST'?'waiting':'completed'}}));
    }}});
  }
  const state=async()=>(await sql('SELECT j.status,p.state,p.stage FROM public.jobs j JOIN public.job_processing p ON p.job_id=j.id WHERE j.id=$1',[job])).rows[0];
  async function toRetention(){
    for(let i=0;i<4;i++){await due();await pipeline().processing.runOne();}
    assert.deepEqual(await state(),{status:'rendering',state:'retry_wait',stage:'render'});
    assert.equal((await pipeline().completion.issueReview(job)).status,'unavailable');
  }
  try{
    await pool.query(`CREATE SCHEMA ${schema}`);await pool.query(`CREATE TABLE ${schema}.jobs (LIKE public.jobs INCLUDING ALL)`);
    for(const file of ['20261106073647_durable_processing.sql','20261108184837_versioned_content.sql','20261108191748_asset_preparation.sql','20261108193747_render_requests.sql','20261108200903_webhook_media.sql'])await sql(readFileSync(`supabase/migrations/${file}`,'utf8'));
    await t.test('fresh service instances resume each stage; missed callback does not block review',async()=>{
      await reset();await toRetention();await due();assert.equal((await pipeline().processing.runOne()).status,'succeeded');
      assert.deepEqual(await state(),{status:'ready_for_review',state:'succeeded',stage:'review'});
      assert.equal(calls,1);assert.equal(submits,1);assert.equal(store.copies,1);
      const p=pipeline();const grant=await p.completion.issueReview(job);assert.equal(grant.status,'ready');
      assert.equal((await p.completion.readReview(grant.url.split('/').at(-1))).status,'ready');
      assert.equal((await p.processing.runOne()).status,'idle');
      const history=await p.processing.history(job);assert.equal(history.attempts.length,5);
      assert.ok(history.attempts.every(a=>a.finished_at>=a.started_at));
      assert.deepEqual(history.checkpoints.map(c=>c.stage).sort(),['assets','content','render']);
      const row=(await sql('SELECT script,heygen_video_id,ghl_post_id FROM public.jobs WHERE id=$1',[job])).rows[0];
      assert.match(row.script,/[א-ת]/u);assert.equal(row.heygen_video_id,null);assert.equal(row.ghl_post_id,null);
    });
    await t.test('overlapping manual workers never duplicate content, submission or retention',async()=>{
      await reset();
      for(let i=0;i<6&&(await state()).stage!=='review';i++){
        await due();await Promise.all(Array.from({length:8},()=>pipeline().processing.runOne()));
      }
      assert.equal((await state()).status,'ready_for_review');assert.equal(calls,1);assert.equal(submits,1);assert.equal(store.copies,1);
    });
    await t.test('retention failure stays outside review and resumes without repeating earlier stages',async()=>{
      await reset();await toRetention();const copy=store.copy.bind(store);store.copy=async()=>{throw new Error('Mock storage outage');};
      await due();assert.equal((await pipeline().processing.runOne()).status,'waiting');
      assert.equal((await state()).status,'rendering');assert.equal((await pipeline().completion.issueReview(job)).status,'unavailable');
      store.copy=copy;await due();assert.equal((await pipeline().processing.runOne()).status,'succeeded');
      assert.equal(calls,1);assert.equal(submits,1);assert.equal(store.copies,1);
    });
    await t.test('final checkpoint rollback reuses retained media after lease recovery',async()=>{
      await reset();await toRetention();await due();
      await sql("ALTER TABLE public.job_processing ADD CONSTRAINT injected CHECK(stage='render')");
      await assert.rejects(pipeline().processing.runOne(),{code:'23514'});
      assert.equal(store.copies,1);assert.equal((await pipeline().completion.issueReview(job)).status,'unavailable');
      const before=inspections;
      await sql('ALTER TABLE public.job_processing DROP CONSTRAINT injected');
      await sql("UPDATE public.job_processing SET lease_until=now()-interval '1 second'");
      await pipeline().processing.runOne();await due();
      assert.equal((await pipeline().processing.runOne()).status,'succeeded');
      assert.equal(inspections,before);assert.equal(store.copies,1);assert.equal(calls,1);assert.equal(submits,1);
    });
    await t.test('disabled retention blocks submission, and cancellation stops later stages',async()=>{
      await reset();await pipeline().processing.runOne();await pipeline().processing.runOne();
      assert.equal((await state()).stage,'render');
      await sql('UPDATE public.completion_config SET enabled=false');await pipeline().processing.runOne();assert.equal(submits,0);
      await sql('UPDATE public.completion_config SET enabled=true');
      assert.equal((await pipeline().processing.control(job,'cancel')).status,'cancelled');
      assert.equal((await pipeline().processing.runOne()).status,'idle');assert.equal(submits,0);
      assert.equal((await pipeline().completion.issueReview(job)).status,'unavailable');
    });
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
