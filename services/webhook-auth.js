const {createHmac,timingSafeEqual,createHash}=require('node:crypto');
const {videoId}=require('./heygen-mock');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function verifySignature(raw,signature,secret){
  if(!Buffer.isBuffer(raw) || raw.length>32768 || typeof secret!=='string' || secret.length<16 ||
    typeof signature!=='string' || !/^[a-f0-9]{64}$/i.test(signature))return false;
  const expected=createHmac('sha256',secret).update(raw).digest();
  return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
function normalizeEvent(raw){
  let body;
  try{body=JSON.parse(raw.toString('utf8'));}catch{return null;}
  if(!body || typeof body!=='object' || Array.isArray(body) || typeof body.event_type!=='string')return null;
  if(!['avatar_video.success','avatar_video.fail'].includes(body.event_type))return {unsupported:true};
  const data=body.event_data;
  if(!data || !videoId(data.video_id))return null;
  const callback=data.callback_id??null;
  if(callback!==null && (typeof callback!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callback)))return null;
  const eventId=body.event_id??null;
  if(eventId!==null && (typeof eventId!=='string' || !/^[A-Za-z0-9_-]{1,150}$/.test(eventId)))return null;
  return {type:body.event_type,videoId:data.video_id,callbackId:callback?.toLowerCase()??null,eventId,
    key:digest(`${body.event_type}:${data.video_id}`),bodyHash:digest(raw)};
}
module.exports={verifySignature,normalizeEvent,digest};
