const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildAvatarRequest,createMockHeyGen}=require('./services/heygen-mock');
const {createPipeline}=require('./services/pipeline');
const express=require('express');
const auth=require('./middleware/apiKeyAuth');
const renderingRouter=require('./routes/rendering');
const manifest=()=>({mode:'mock',avatar_id:'mock-avatar',voice:{mode:'builtin',voice_id:'mock-voice',audio:null},
  script:'תסריט עברי מדומה',visual_plan:[{description:'דמות מדברת',duration_seconds:15}],media_ids:[]});
const cfg={engine:'avatar_iv',resolution:'720p',aspect_ratio:'9:16'};
test('v3 mapping is explicit about unsupported scene/media/voice compositions',()=>{
  const payload=buildAvatarRequest(manifest(),cfg);
  assert.equal(payload.type,'avatar');assert.equal(payload.script,manifest().script);
  assert.deepEqual(payload.engine,{type:'avatar_iv'});assert.equal(payload.voice_id,'mock-voice');
  assert.ok(!Object.hasOwn(payload,'video_inputs'));assert.ok(!Object.hasOwn(payload,'callback_url'));
  for(const change of [m=>m.mode='live',m=>m.media_ids=['some-image'],m=>m.voice.mode='external_mock',
    m=>m.visual_plan.push({...m.visual_plan[0]}),m=>m.avatar_id='../bad']){
    const m=manifest();change(m);assert.throws(()=>buildAvatarRequest(m,cfg),e=>e.code==='RENDER_COMPOSITION_UNSUPPORTED');
  }
});
test('mock transport uses v3 endpoints and stable idempotency key, never real credentials',async()=>{
  let count=0;
  const adapter=createMockHeyGen({transport:{mode:'mock',async request(url,options){
    count++;assert.ok(url.startsWith('https://api.heygen.com/v3/videos'));
    assert.equal(options.headers['x-api-key'],'mock-only-no-real-credential');assert.equal(options.redirect,'error');
    if(options.method==='POST')assert.equal(options.headers['Idempotency-Key'],'same-key');
    return new Response(JSON.stringify({data:{video_id:'mock_video',status:'completed',video_url:'https://secret.invalid/?token=private'}}));
  }}});
  const submit=await adapter.submit({payload:buildAvatarRequest(manifest(),cfg),idempotencyKey:'same-key'});
  assert.equal(submit.externalId,'mock_video');
  const poll=await adapter.poll({externalId:'mock_video'});assert.equal(poll.status,'completed');
  assert.ok(!JSON.stringify(poll).includes('private'));assert.equal(count,2);
  assert.throws(()=>createMockHeyGen(),e=>e.code==='MOCK_TRANSPORT_REQUIRED');
});
test('rate limits, credits, transport ambiguity and malformed provider responses are classified',async()=>{
  const cases=[
    [()=>new Response(JSON.stringify({error:{code:'rate_limit_exceeded'}}),{status:429}),'HEYGEN_RATE_LIMIT',true,false],
    [()=>new Response(JSON.stringify({error:{code:'quota_exceeded'}}),{status:429}),'HEYGEN_QUOTA',false,false],
    [()=>new Response('{}',{status:503}),'HEYGEN_UNCERTAIN',false,true],
    [()=>new Response(JSON.stringify({error:{code:'request_in_progress'}}),{status:409}),'HEYGEN_UNCERTAIN',false,true],
    [()=>{throw new Error('private exception');},'HEYGEN_TRANSPORT',false,true],
    [()=>new Response('private html'),'HEYGEN_INVALID_RESPONSE',false,true],
    [()=>new Response(JSON.stringify({data:{video_id:'real_id'}})),'HEYGEN_INVALID_ID',false,true],
  ];
  for(const [request,code,retryable,uncertain]of cases){
    const p=createMockHeyGen({transport:{mode:'mock',request}});
    await assert.rejects(p.submit({payload:{},idempotencyKey:'test'}),e=>{
      assert.equal(e.code,code);assert.equal(e.retryable,retryable);assert.equal(e.uncertain,uncertain);
      assert.ok(!e.message.includes('private'));return true;
    });
  }
  const p=createMockHeyGen({transport:{mode:'mock',request:async()=>new Response('{}',{status:503})}});
  await assert.rejects(p.poll({externalId:'mock_video'}),e=>e.retryable&&!e.uncertain);
});
test('production ignores environment attempts to activate a real rendering provider',async()=>{
  const p=createPipeline({query:()=>{throw new Error('Must not query');}},{HEYGEN_API_KEY:'unused',RENDER_ENABLED:'true'});
  assert.equal(await p.rendering.handler.isAvailable(()=>{throw new Error('Must not query');}),false);
});
test('rate-limit retry headers are preserved and excessive delays stop automatic retry',async()=>{
  for(const seconds of [120,7200]){
    const p=createMockHeyGen({transport:{mode:'mock',request:async()=>new Response(
      JSON.stringify({error:{code:'rate_limit_exceeded'}}),{status:429,headers:{'retry-after':String(seconds)}})}});
    await assert.rejects(p.submit({payload:{},idempotencyKey:'test'}),e=>{
      assert.equal(e.retryAfterSeconds,Math.min(3600,seconds));assert.equal(e.retryable,seconds<=3600);return true;
    });
  }
});
test('render history is owner-only and never echoes internal error details',async()=>{
  const previous={API_KEY:process.env.API_KEY,SCHEDULER_API_KEY:process.env.SCHEDULER_API_KEY};
  process.env.API_KEY='owner';process.env.SCHEDULER_API_KEY='scheduler';let reads=0;
  const app=express();app.use('/jobs',auth,renderingRouter({history:async()=>{reads++;throw new Error('private provider data');}}));
  const server=app.listen(0,'127.0.0.1');
  try{
    await new Promise(resolve=>server.once('listening',resolve));
    const url=`http://127.0.0.1:${server.address().port}/jobs/00000000-0000-0000-0000-000000000001/rendering`;
    for(const key of ['','scheduler'])assert.equal((await fetch(url,{headers:{'x-api-key':key}})).status,401);
    assert.equal(reads,0);
    const response=await fetch(url,{headers:{'x-api-key':'owner'}});
    assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private'));
  }finally{
    for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
    await new Promise(resolve=>server.close(resolve));
  }
});
