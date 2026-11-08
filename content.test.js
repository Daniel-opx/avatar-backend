const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateContent } = require('./services/content-schema');
const { createOpenAI } = require('./services/llm-provider');
const { createPipeline } = require('./services/pipeline');
const express = require('express');
const auth = require('./middleware/apiKeyAuth');
const contentRouter = require('./routes/content');
const fixture = () => ({language:'he',script:'שלום, בואו להכיר דרך פשוטה לתכנן תוכן. רוצים לשמוע עוד?',
  caption:'רעיונות לתוכן בעברית',hashtags:['#תוכן'],visual_plan:[{description:'דמות מדברת למצלמה',
    on_screen_text:'בואו נדבר',duration_seconds:15}],claims:[],metadata:{tone:'נעים',audience:'בעלי עסקים',review_notes:['נדרשת בדיקה אנושית']}});
const body = content => ({status:'completed',model:'test-model-resolved',usage:{input_tokens:100,output_tokens:50},
  output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(content)}]}]});

test('closed Hebrew content validation rejects malformed and unsupported claims',()=>{
  assert.equal(validateContent(fixture()),true);
  for (const change of [p=>p.script='English only',p=>p.language='en',p=>p.extra=true,
    p=>delete p.caption,p=>p.hashtags=['not a hashtag'],p=>p.visual_plan[0].duration_seconds=0,
    p=>p.metadata.review_notes=['English only'],p=>p.claims=[{text:'הטענה',source_fact:'invented'}]]) {
    const p=fixture();change(p);assert.equal(validateContent(p),false);
  }
  const p=fixture();p.claims=[{text:'הטענה',source_fact:'עובדה מאומתת'}];
  assert.equal(validateContent(p,['עובדה מאומתת']),true);
});
test('OpenAI adapter uses documented structured format and never leaks credentials in results',async()=>{
  let called=0;
  const provider=createOpenAI({apiKey:'private-test-key',fetchImpl:async(url,options)=>{
    called++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.redirect,'error');
    const request=JSON.parse(options.body);assert.equal(request.store,false);
    assert.equal(request.text.format.strict,true);assert.equal(request.text.format.type,'json_schema');
    assert.equal(request.max_output_tokens,1000);assert.equal(request.model,'test-model');
    assert.equal(options.headers.authorization,'Bearer private-test-key');
    return new Response(JSON.stringify(body(fixture())),{headers:{'x-request-id':'req_test'}});
  }});
  const result=await provider.generate({model:'test-model',instructions:'test',input:{topic:'נושא'},maxOutputTokens:1000});
  assert.equal(called,1);assert.deepEqual(result.usage,{input:100,output:50});
  assert.equal(result.requestId,'req_test');assert.equal(result.model,'test-model-resolved');
  assert.ok(!JSON.stringify(result).includes('private-test-key'));
});
test('provider rejections, rate limits, refusal, truncation and malformed data are classified',async()=>{
  const cases=[
    [()=>new Response('{}',{status:429}), 'PROVIDER_RATE_LIMIT',true,false],
    [()=>new Response(JSON.stringify({error:{code:'insufficient_quota'}}),{status:429}), 'PROVIDER_QUOTA',false,false],
    [()=>new Response('private provider message',{status:401}), 'PROVIDER_REJECTED',false,false],
    [()=>new Response('private provider message',{status:503}), 'PROVIDER_UNCERTAIN',false,true],
    [()=>{throw new Error('private transport details');},'PROVIDER_TRANSPORT',false,true],
    [()=>new Response('invalid json'),'MALFORMED_RESPONSE',false,false],
    [()=>new Response(JSON.stringify({...body(fixture()),status:'incomplete'})),'PROVIDER_INCOMPLETE',false,false],
    [()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'private'}]}]})),
      'PROVIDER_REFUSAL',false,false],
    [()=>new Response(JSON.stringify({status:'completed',output:[]})),'MALFORMED_CONTENT',false,false],
  ];
  for (const [fetchImpl,code,retryable,uncertain] of cases) {
    const provider=createOpenAI({apiKey:'private-test-key',fetchImpl});
    await assert.rejects(provider.generate({model:'test-model',instructions:'test',input:{},maxOutputTokens:1000}),e=>{
      assert.equal(e.code,code);assert.equal(e.retryable,retryable);assert.equal(e.uncertain,uncertain);
      assert.ok(!e.message.includes('private'));return true;
    });
  }
});
test('runtime has no provider and cannot query generation config by default',async()=>{
  const pipeline=createPipeline({query:()=>{throw new Error('must not query');}},{});
  assert.equal(await pipeline.content.handler.isAvailable(()=>{throw new Error('must not query');}),false);
});
test('content HTTP access requires owner key and validates idempotent regeneration input',async()=>{
  const previous={API_KEY:process.env.API_KEY,SCHEDULER_API_KEY:process.env.SCHEDULER_API_KEY};
  process.env.API_KEY='owner-test';process.env.SCHEDULER_API_KEY='scheduler-test';
  const id='00000000-0000-0000-0000-000000000001';let calls=0;
  const app=express();app.use('/jobs',auth,express.json(),contentRouter({
    history:async()=>({versions:[],calls:[]}),
    regenerate:async(job,key)=>{calls++;assert.equal(job,id);assert.equal(key,id);return {status:'queued',revision:2};},
  }));
  const server=app.listen(0,'127.0.0.1');
  try {
    await new Promise(resolve=>server.once('listening',resolve));
    const url=`http://127.0.0.1:${server.address().port}/jobs/${id}/content`;
    for(const key of ['', 'scheduler-test']) {
      assert.equal((await fetch(url,{headers:{'x-api-key':key}})).status,401);
      assert.equal((await fetch(`${url}/regenerate`,{method:'POST',headers:{'x-api-key':key}})).status,401);
    }
    const headers={'x-api-key':'owner-test','content-type':'application/json'};
    assert.equal((await fetch(url,{headers})).status,200);
    for(const data of [{},{request_key:'invalid'},{request_key:id,provider:'openai'}]) {
      assert.equal((await fetch(`${url}/regenerate`,{method:'POST',headers,body:JSON.stringify(data)})).status,400);
    }
    assert.equal((await fetch(`${url}/regenerate`,{method:'POST',headers,body:JSON.stringify({request_key:id})})).status,200);
    assert.equal(calls,1);
  } finally {
    for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    await new Promise(resolve=>server.close(resolve));
  }
});
