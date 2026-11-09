const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createIdentityProvider}=require('./services/supabase-auth');
test('managed identity requires explicit configuration and never trusts metadata roles',async()=>{
  let calls=0;
  const disabled=createIdentityProvider({}, {clientFactory(){calls++;throw new Error();}});
  assert.equal(disabled.enabled,false);assert.equal(await disabled.login('a@b.test','secret'),null);assert.equal(calls,0);
  const id=randomUUID(),sid=randomUUID(),base='https://exampleproject.supabase.co';
  let claims={sub:id,session_id:sid,iss:base+'/auth/v1',exp:Math.floor(Date.now()/1000)+3600};let valid=true;
  const provider=createIdentityProvider({TEAM_AUTH_ENABLED:'true',SUPABASE_URL:base,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},
    {clientFactory(options){assert.equal(options.persistSession,false);return{
      async signInWithPassword(){return {data:{session:{access_token:'header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature'}}};},
      async getUser(){return valid?{data:{user:{id,user_metadata:{role:'admin'}}}}:{error:new Error('invalid')};},
    };}});
  assert.deepEqual(Object.keys(await provider.login('a@b.test','secret')).sort(),['expiresAt','id','sessionId']);
  claims.iss='https://attacker.invalid/auth/v1';assert.equal(await provider.login('a@b.test','secret'),null);
  claims.iss=base+'/auth/v1';valid=false;assert.equal(await provider.login('a@b.test','secret'),null);
});
test('production auth and approval endpoints stay closed without team credentials',async()=>{
  const {createApp}=require('./app');const app=createApp({logger:()=>{},pool:{query:async()=>({rows:[]})}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  try{
    assert.equal((await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'test@example.invalid',password:'test-only'})})).status,503);
    for(const path of ['/auth/me','/team/members','/team/notifications','/team/audit'])assert.equal((await fetch(base+path)).status,401);
  }finally{await new Promise(r=>server.close(r));await require('./db/pool').end();}
});
