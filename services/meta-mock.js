// No default network transport or real credentials. This adapter accepts mock identities only.
const {AccessError}=require('./team');
const mockId=value=>typeof value==='string'&&/^mock_[A-Za-z0-9_-]{1,100}$/.test(value);
const stages=['campaign','adset','creative','ad'];
const apiVersion='v26.0'; // Official Meta SDK source inspected 2026-11-11; live acceptance pending.
function validateSpec(input){
  const keys=['name','account_id','page_id','video_id','currency','lifetime_budget_minor','start_time','end_time','link','country'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))throw new AccessError(400);
  const {name,account_id,page_id,video_id,currency,lifetime_budget_minor:budget,start_time:start,end_time:end,link,country}=input;
  const date=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s));
  if(typeof name!=='string'||!name.trim()||name.length>100||![account_id,page_id,video_id].every(mockId)
    ||currency!=='ILS'||country!=='IL'||!Number.isSafeInteger(budget)||budget<1||budget>100000
    ||!date(start)||!date(end)||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>30*86400000
    ||link!=='https://example.invalid/offer')throw new AccessError(400);
  return {name:name.trim(),account_id,page_id,video_id,currency,lifetime_budget_minor:budget,
    start_time:new Date(start).toISOString(),end_time:new Date(end).toISOString(),link,country,
    objective:'OUTCOME_TRAFFIC',status:'PAUSED',special_ad_categories:[]};
}
function buildOperation(stage,spec,snapshot,ids){
  const name=spec.name;
  if(stage==='campaign')return {name,objective:spec.objective,status:'PAUSED',special_ad_categories:[]};
  if(stage==='adset')return {name,campaign_id:ids.campaign,lifetime_budget:spec.lifetime_budget_minor,
    start_time:spec.start_time,end_time:spec.end_time,billing_event:'IMPRESSIONS',optimization_goal:'LINK_CLICKS',
    bid_strategy:'LOWEST_COST_WITHOUT_CAP',status:'PAUSED',targeting:{geo_locations:{countries:['IL']},age_min:21,age_max:65,
      publisher_platforms:['facebook'],facebook_positions:['feed']}};
  if(stage==='creative')return {name,object_story_spec:{page_id:spec.page_id,video_data:{video_id:spec.video_id,
    message:snapshot.content.caption,call_to_action:{type:'LEARN_MORE',value:{link:spec.link}}}}};
  if(stage==='ad')return {name,adset_id:ids.adset,creative:{creative_id:ids.creative},status:'PAUSED'};
  throw new AccessError(400);
}
class MetaError extends Error{constructor(code,retryAfter=30){super(code);this.code=code;this.retryAfter=retryAfter;}}
function createMockMeta({transport}={}){
  if(transport?.mode!=='mock'||typeof transport.request!=='function')throw new Error('Mock transport required');
  async function request(path,options){
    let r,body;
    try{r=await transport.request(`https://graph.facebook.com/${apiVersion}/${path}`,{
      ...options,redirect:'error',headers:{Authorization:'Bearer mock_only','Content-Type':'application/json'}});body=await r.json();}
    catch{throw new MetaError('META_OUTCOME_UNKNOWN');}
    if(!r.ok||body?.error){const retry=Math.min(3600,Math.max(30,Number(r.headers.get('retry-after'))||30));
      throw new MetaError(r.status===429||[4,17,32,613].includes(body?.error?.code)?'META_RATE_LIMITED':'META_REJECTED',retry);}
    if(!mockId(body?.id))throw new MetaError('META_INVALID_RESPONSE');return body;
  }
  return {mode:'mock',async create({stage,account,payload,signal}){
    if(!stages.includes(stage)||!mockId(account)||(stage!=='creative'&&payload?.status!=='PAUSED'))throw new MetaError('META_INVALID_REQUEST');
    const edge={campaign:'campaigns',adset:'adsets',creative:'adcreatives',ad:'ads'}[stage];
    const result=await request(`act_${account}/${edge}`,{method:'POST',body:JSON.stringify(payload),signal});
    if(stage!=='creative'&&result.status&&result.status!=='PAUSED')throw new MetaError('META_UNEXPECTED_STATUS');
    return result;
  },async inspect({id,stage,signal}){
    if(!mockId(id)||!stages.includes(stage))throw new MetaError('META_INVALID_REQUEST');
    const result=await request(`${id}?fields=${stage==='creative'?'id':'id,status'}`,{method:'GET',signal});
    if(result.id!==id||(stage!=='creative'&&result.status!=='PAUSED'))throw new MetaError('META_UNEXPECTED_STATUS');
    return result;
  }};
}
module.exports={createMockMeta,validateSpec,buildOperation,mockId,stages,apiVersion,MetaError};
