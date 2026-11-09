const {AuthClient}=require('@supabase/auth-js');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
function createIdentityProvider(env=process.env,{clientFactory=options=>new AuthClient(options)}={}){
  const url=env.SUPABASE_URL;
  const enabled=env.TEAM_AUTH_ENABLED==='true'&&typeof url==='string'&&/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)
    && typeof env.SUPABASE_PUBLISHABLE_KEY==='string'&&env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_');
  return {enabled:Boolean(enabled),async login(email,password){
    if(!enabled)return null;
    const client=clientFactory({url:url+'/auth/v1',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY},
      persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,
      fetch:(target,options)=>fetch(target,{...options,redirect:'error',signal:AbortSignal.timeout(8000)})});
    const signed=await client.signInWithPassword({email,password});
    if(signed.error||!signed.data?.session?.access_token)return null;
    const token=signed.data.session.access_token;
    const verified=await client.getUser(token);
    if(verified.error||!verified.data?.user?.id)return null;
    let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}catch{return null;}
    if(claims.sub!==verified.data.user.id||!uuid(claims.sub)||!uuid(claims.session_id)||claims.iss!==url+'/auth/v1'
      ||!Number.isSafeInteger(claims.exp)||claims.exp*1000<=Date.now())return null;
    // Role/user_metadata and provider credentials never leave this adapter.
    return {id:claims.sub,sessionId:claims.session_id,expiresAt:new Date(claims.exp*1000)};
  }};
}
module.exports={createIdentityProvider,uuid};
