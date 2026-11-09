require('dotenv').config({quiet:true});
const {test}=require('node:test');const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');const {readFileSync}=require('node:fs');
const pool=require('./db/pool');const {createTeamService}=require('./services/team');
const {createApprovalService}=require('./services/approvals');
test('team sessions and exact-version mock approval with isolated PostgreSQL',{
  skip:process.env.RUN_DB_TESTS!=='1',timeout:300000,
},async t=>{
  const schema=`step21_test_${randomUUID().replaceAll('-','')}`;
  const sql=(s,v)=>pool.query(s.replaceAll('public.',schema+'.'),v);
  const identities={};let forceIdentity;
  const provider={enabled:true,async login(email,password){if(password!=='mock-password')return null;
    const id=identities[email];if(!id)return null;
    if(forceIdentity)return forceIdentity;
    const sessionId=randomUUID();await sql('INSERT INTO public.sessions(id,user_id) VALUES($1,$2)',[sessionId,id]);
    return {id,sessionId,expiresAt:new Date(Date.now()+3600000)};
  }};
  const team=createTeamService(pool,{schema,identitySchema:schema,provider});
  const approvals=createApprovalService(pool,team,{schema});
  let admin,operator,reviewer,adminLogin,operatorLogin,reviewerLogin,job;
  async function reset(){
    await sql('TRUNCATE public.jobs CASCADE');await sql('TRUNCATE public.team_members CASCADE');await sql('TRUNCATE public.users CASCADE');
    forceIdentity=null;
    for(const role of ['admin','operator','reviewer']){
      const id=randomUUID();identities[role+'@test.invalid']=id;
      await sql('INSERT INTO public.users(id) VALUES($1)',[id]);await sql('INSERT INTO public.team_members(id,role) VALUES($1,$2)',[id,role]);
    }
    adminLogin=await team.login('admin@test.invalid','mock-password');admin=await team.lookup(adminLogin.token);
    operatorLogin=await team.login('operator@test.invalid','mock-password');operator=await team.lookup(operatorLogin.token);
    reviewerLogin=await team.login('reviewer@test.invalid','mock-password');reviewer=await team.lookup(reviewerLogin.token);
    job=(await sql("INSERT INTO public.jobs(topic) VALUES('בדיקת אישור מדומה') RETURNING id")).rows[0].id;
    const cr=randomUUID(),render=randomUUID();
    const pack={script:'תסריט עברי לבדיקה',caption:'כיתוב לבדיקה',hashtags:['#בדיקה'],visual_plan:[{description:'בדיקה',on_screen_text:'בדיקה',duration_seconds:15}]};
    await sql(`INSERT INTO public.content_requests(id,job_id,revision,state,token,provider,model,prompt_version,input_snapshot)
      VALUES($1,$2,1,'succeeded',$3,'mock','mock',1,'{}')`,[cr,job,randomUUID()]);
    await sql('INSERT INTO public.content_versions(job_id,revision,request_id,package) VALUES($1,1,$2,$3)',[job,cr,pack]);
    await sql("INSERT INTO public.asset_manifests(job_id,revision,manifest) VALUES($1,1,'{}')",[job]);
    await sql(`INSERT INTO public.render_requests(id,job_id,revision,state,token,payload,external_video_id,max_polls,poll_after_seconds)
      VALUES($1,$2,1,'completed',$3,'{}','mock_approval',60,5)`,[render,job,randomUUID()]);
    await sql(`INSERT INTO public.video_media(render_request_id,state,bucket,object_key,mime_type,size_bytes,sha256)
      VALUES($1,'ready','mock-videos','mock.mp4','video/mp4',10,$2)`,[render,'a'.repeat(64)]);
    await sql("UPDATE public.jobs SET script=$2,visual_plan=$3,status='ready_for_review' WHERE id=$1",[job,pack.script,JSON.stringify(pack.visual_plan)]);
    await sql("UPDATE public.job_processing SET stage='review',state='succeeded' WHERE job_id=$1",[job]);
  }
  const decision=(request,action='approved')=>({request_key:randomUUID(),action,expected_hash:request.snapshot_hash,comment:'נבדק על ידי אדם — הדגמה בלבד'});
  try{
    await pool.query(`CREATE SCHEMA ${schema}`);await pool.query(`CREATE TABLE ${schema}.jobs (LIKE public.jobs INCLUDING ALL)`);
    await sql('CREATE TABLE public.users(id uuid PRIMARY KEY); CREATE TABLE public.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,not_after timestamptz)');
    for(const file of ['20261106073647_durable_processing.sql','20261108184837_versioned_content.sql','20261108191748_asset_preparation.sql','20261108193747_render_requests.sql','20261108200903_webhook_media.sql','20261109053326_team_access.sql','20261109053341_video_approvals.sql']){
      await sql(readFileSync('supabase/migrations/'+file,'utf8'));
    }
    await t.test('managed sessions are hashed, bounded and revoked immediately on logout or identity removal',async()=>{
      await reset();const row=(await sql('SELECT * FROM public.team_sessions WHERE member_id=$1',[reviewer.id])).rows[0];
      assert.notEqual(row.token_hash,reviewerLogin.token);assert.notEqual(row.csrf_hash,reviewerLogin.csrf);
      assert.ok(+row.expires_at<=Date.now()+1800000);assert.equal(await team.lookup('x'.repeat(43)),null);
      await assert.rejects(team.logout(reviewerLogin.token,'x'.repeat(43)),{status:403});
      await team.logout(reviewerLogin.token,reviewerLogin.csrf);assert.equal(await team.lookup(reviewerLogin.token),null);
      forceIdentity={id:reviewer.id,sessionId:row.provider_session_id,expiresAt:new Date(Date.now()+3600000)};
      assert.equal((await team.login('reviewer@test.invalid','mock-password')).status,'unauthorized');forceIdentity=null;
      await sql('DELETE FROM public.sessions WHERE user_id=$1',[operator.id]);assert.equal(await team.lookup(operatorLogin.token),null);
      await sql("UPDATE public.team_sessions SET expires_at=now()-interval '1 second' WHERE member_id=$1",[admin.id]);assert.equal(await team.lookup(adminLogin.token),null);
      const outsider=randomUUID();identities['outsider@test.invalid']=outsider;await sql('INSERT INTO public.users(id) VALUES($1)',[outsider]);
      assert.equal((await team.login('outsider@test.invalid','mock-password')).status,'unauthorized');
    });
    await t.test('roles come from current membership and last-admin removal is refused',async()=>{
      await reset();await assert.rejects(team.setMember(reviewer,operator.id,'admin',true),{status:403});
      await assert.rejects(team.setMember(admin,admin.id,'reviewer',true),{status:409});
      await team.setMember(admin,reviewer.id,'operator',true);
      assert.equal((await team.lookup(reviewerLogin.token)).role,'operator');
      const request=await approvals.request(operator,job,randomUUID());
      await assert.rejects(approvals.decide(reviewer,job,request.id,decision(request)),{status:403});
      await team.setMember(admin,operator.id,'operator',false);assert.equal(await team.lookup(operatorLogin.token),null);
    });
    await t.test('concurrent decisions remain idempotent across UUID casing; mock approval never publishes',async()=>{
      await reset();const request=await approvals.request(operator,job,randomUUID()),body=decision(request);
      assert.equal((await approvals.request(operator,job.toUpperCase(),request.id.toUpperCase())).id,request.id);
      body.request_key=body.request_key.toUpperCase();
      const results=await Promise.all(Array.from({length:6},()=>approvals.decide(reviewer,job,request.id,body)));
      assert.ok(results.every(r=>r.state==='approved'&&!r.publication_authorized));
      assert.equal((await sql('SELECT count(*)::int AS n FROM public.approval_decisions')).rows[0].n,1);
      await assert.rejects(approvals.decide(reviewer,job,request.id,{...body,comment:'different'}),{status:409});
      assert.deepEqual(await approvals.publicationGate(operator,job),{approved_snapshot:true,publication_authorized:false,reason:'MOCK_MEDIA'});
      await assert.rejects(sql("UPDATE public.jobs SET status='published' WHERE id=$1",[job]),{code:'23514'});
      await assert.rejects(sql("INSERT INTO public.jobs(topic,status) VALUES('blocked','scheduled')"),{code:'23514'});
      assert.equal((await sql('SELECT status FROM public.jobs WHERE id=$1',[job])).rows[0].status,'ready_for_review');
      const d=(await sql('SELECT reviewer_id,comment,created_at FROM public.approval_decisions')).rows[0];assert.equal(d.reviewer_id,reviewer.id);assert.equal(d.comment,body.comment);assert.ok(d.created_at);
    });
    await t.test('text or media changes invalidate the exact fingerprint before decision and after approval',async()=>{
      await reset();let request=await approvals.request(operator,job,randomUUID());
      await sql("UPDATE public.content_versions SET package=jsonb_set(package,'{caption}','\"שונה\"') WHERE job_id=$1",[job]);
      assert.equal((await approvals.decide(reviewer,job,request.id,decision(request))).state,'superseded');
      request=await approvals.request(operator,job,randomUUID());await approvals.decide(reviewer,job,request.id,decision(request));
      await sql("UPDATE public.video_media SET sha256=$1",['b'.repeat(64)]);
      assert.equal((await approvals.publicationGate(operator,job)).approved_snapshot,false);
      assert.equal((await approvals.detail(reviewer,job,request.id)).current,false);
      await sql('UPDATE public.video_media SET sha256=$1',['a'.repeat(64)]);
      await sql("UPDATE public.job_processing SET state='failed'");
      assert.equal((await approvals.publicationGate(operator,job)).approved_snapshot,false);
    });
    await t.test('competing approve/reject actions commit only one final decision',async()=>{
      await reset();const request=await approvals.request(operator,job,randomUUID());
      const results=await Promise.allSettled([approvals.decide(reviewer,job,request.id,decision(request)),
        approvals.decide(admin,job,request.id,decision(request,'rejected'))]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal((await sql('SELECT count(*)::int AS n FROM public.approval_decisions')).rows[0].n,1);
    });
    await t.test('revision requests queue one new version, preserve decisions and require a fresh review',async()=>{
      await reset();const request=await approvals.request(operator,job,randomUUID());
      await approvals.decide(reviewer,job,request.id,decision(request,'revision_requested'));
      const body={request_key:randomUUID(),topic:'נושא מתוקן לבדיקה'};
      const results=await Promise.all(Array.from({length:5},()=>approvals.revise(operator,job,request.id,body)));
      assert.ok(results.every(r=>r.revision===2));assert.equal((await sql('SELECT content_revision FROM public.job_processing')).rows[0].content_revision,2);
      assert.equal((await sql('SELECT count(*)::int AS n FROM public.content_versions')).rows[0].n,1);
      assert.equal((await sql('SELECT state FROM public.approval_requests')).rows[0].state,'revision_requested');
      await assert.rejects(approvals.request(operator,job,randomUUID()),{status:409});
      assert.equal((await approvals.publicationGate(operator,job)).approved_snapshot,false);
    });
    await t.test('in-app notifications stay private and rejected content has no publishing authority',async()=>{
      await reset();const request=await approvals.request(operator,job,randomUUID());
      assert.equal((await approvals.notifications(reviewer)).length,1);assert.equal((await approvals.notifications(operator)).length,0);
      await approvals.markRead(reviewer,request.id,'review_requested');assert.ok((await approvals.notifications(reviewer))[0].read_at);
      await approvals.decide(reviewer,job,request.id,decision(request,'rejected'));
      assert.equal((await approvals.notifications(operator))[0].kind,'decision');
      await assert.rejects(approvals.decide(operator,job,request.id,decision(request)),{status:403});
      const rows=(await sql("SELECT relrowsecurity,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'SELECT') AS client FROM pg_class WHERE relnamespace=$1::regnamespace AND relname IN ('team_members','team_sessions','audit_events','approval_requests','approval_decisions','approval_notifications')",[schema])).rows;
      assert.equal(rows.length,6);assert.ok(rows.every(r=>r.relrowsecurity&&!r.anon&&!r.client));
      assert.ok((await team.auditHistory(admin)).some(e=>e.action==='approval_rejected'));
    });
    await t.test('a rejected mock video can be replaced and the new version needs its own decision',async()=>{
      await reset();const first=await approvals.request(operator,job,randomUUID());
      await approvals.decide(reviewer,job,first.id,decision(first,'rejected'));
      await sql("UPDATE public.processing_config SET enabled=true");
      await sql("UPDATE public.content_config SET enabled=true,provider='openai',model='mock',max_requests=1");
      await sql("UPDATE public.asset_config SET enabled=true,avatar_id='mock-avatar',voice_id='mock-voice'");
      await sql('UPDATE public.render_config SET enabled=true,max_submissions=1,poll_after_seconds=5');
      await sql('UPDATE public.completion_config SET enabled=true');
      const {createMockVideoStore}=require('./test-support/mock-video-store');
      const provider={mode:'mock',submit:async()=>({externalId:'mock_replacement'}),poll:async()=>({status:'completed'}),
        inspect:async()=>({externalId:'mock_replacement',status:'completed',callbackId:null,durationSeconds:15})};
      const completion=require('./services/completion').createCompletionService(pool,{schema,allowMock:true,provider,store:createMockVideoStore()});
      const oldGrant=await completion.issueReview(job);assert.equal(oldGrant.status,'ready');
      await approvals.revise(operator,job,first.id,{request_key:randomUUID(),topic:'גרסה חדשה'});
      assert.equal((await completion.readReview(oldGrant.url.split('/').at(-1))).status,'not_found');
      const content=require('./services/content').createContentService(pool,{schema,liveAllowed:true,providers:{openai:{generate:async()=>({
        model:'mock',content:{language:'he',script:'זוהי גרסה חדשה של תסריט לבדיקה.',caption:'תוכן חדש',hashtags:['#בדיקה'],
          visual_plan:[{description:'דמות מדברת',on_screen_text:'תוכן חדש',duration_seconds:15}],claims:[],
          metadata:{tone:'נעים',audience:'בודקים',review_notes:['לבדיקה בלבד']}}
      })}}});
      const pipeline=require('./services/pipeline').composePipeline(pool,{content,completion,
        assets:require('./services/assets').createAssetService(pool,{schema,allowPreparation:true}),
        rendering:require('./services/rendering').createRenderService(pool,{schema,allowMock:true,provider})},{schema});
      for(let i=0;i<5;i++){
        await sql('UPDATE public.job_processing SET next_attempt_at=clock_timestamp()');
        await sql('UPDATE public.render_requests SET next_action_at=clock_timestamp()');
        await sql('UPDATE public.video_media SET next_check_at=clock_timestamp()');await pipeline.processing.runOne();
      }
      const next=await approvals.request(operator,job,randomUUID());assert.notEqual(next.snapshot_hash,first.snapshot_hash);
      assert.equal((await approvals.detail(reviewer,job,next.id)).snapshot.revision,2);
      await approvals.decide(reviewer,job,next.id,decision(next));
      assert.equal((await sql('SELECT count(*)::int AS n FROM public.content_versions')).rows[0].n,2);
      assert.equal((await sql('SELECT count(*)::int AS n FROM public.approval_decisions')).rows[0].n,2);
      assert.equal((await approvals.publicationGate(operator,job)).publication_authorized,false);
    });
    await t.test('HTTP sessions enforce CSRF and cannot substitute for internal scheduler authentication',async()=>{
      await reset();const {createApp}=require('./app');const logs=[];
      const app=createApp({pool,team,approvals,render:true,logger:s=>logs.push(s)});
      const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
      try{
        const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json','x-forwarded-proto':'https'},body:JSON.stringify({email:'reviewer@test.invalid',password:'mock-password'})});
        assert.equal(login.status,200);const cookie=login.headers.getSetCookie().find(c=>c.startsWith('__Host-avatar_session='));
        assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=Strict/i);
        const user=await login.json(),headers={cookie:cookie.split(';')[0],'x-forwarded-proto':'https','content-type':'application/json'};
        assert.equal((await fetch(base+'/auth/me',{headers})).status,200);
        const request=await approvals.request(operator,job,randomUUID());
        const path=`/jobs/${job}/APPROVALS/${request.id}/DECISIONS`;
        assert.equal((await fetch(base+path,{method:'POST',headers,body:JSON.stringify(decision(request))})).status,403);
        assert.equal((await fetch(base+'/jobs',{method:'POST',headers:{...headers,'x-csrf-token':user.csrf_token},body:'{"topic":"blocked"}'})).status,403);
        assert.equal((await fetch(base+'/internal/run-scheduler',{method:'POST',headers})).status,401);
        assert.equal((await fetch(base+'/internal/processing/run',{method:'POST',headers})).status,401);
        assert.equal((await fetch(base+path,{method:'POST',headers:{...headers,'x-csrf-token':user.csrf_token,origin:'https://attacker.invalid'},body:JSON.stringify(decision(request))})).status,403);
        assert.equal((await fetch(base+path,{method:'POST',headers:{'x-api-key':process.env.API_KEY,'content-type':'application/json'},body:JSON.stringify(decision(request))})).status,401);
        assert.equal((await fetch(base+path,{method:'POST',headers:{...headers,'x-csrf-token':user.csrf_token},body:JSON.stringify(decision(request))})).status,200);
        assert.equal((await fetch(base+'/auth/logout',{method:'POST',headers:{...headers,'x-csrf-token':user.csrf_token}})).status,204);
        assert.equal((await fetch(base+'/auth/me',{headers})).status,401);
        assert.equal(logs.some(s=>s.includes('mock-password')||s.includes(user.csrf_token)||s.includes('reviewer@test.invalid')),false);
      }finally{await new Promise(r=>server.close(r));}
    });
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
