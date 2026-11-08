const { isIP } = require('node:net');
const TYPES = {
  image: { mime: ['image/jpeg','image/png','image/webp'], bytes: 10*1024*1024 },
  audio: { mime: ['audio/mpeg','audio/wav','audio/mp4'], bytes: 25*1024*1024 },
  video: { mime: ['video/mp4','video/webm'], bytes: 100*1024*1024 },
};
const identifier = value => typeof value==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
function validReference(ref) {
  return ref && identifier(ref.bucket) && typeof ref.object_key==='string' &&
    ref.object_key.length<=500 && ref.object_key.split('/').every(part=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part) && part!=='.' && part!=='..');
}
function validMetadata(kind, metadata) {
  const type=TYPES[kind];
  return Boolean(type && metadata && type.mime.includes(metadata.mime_type) &&
    Number.isSafeInteger(Number(metadata.size_bytes)) && Number(metadata.size_bytes)>0 &&
    Number(metadata.size_bytes)<=type.bytes && /^[a-f0-9]{64}$/.test(metadata.sha256));
}
function validSignedURL(url, origin, ref, expiresAt, now=Date.now()) {
  try {
    const parsed=new URL(url);const trusted=new URL(origin);
    return validReference(ref) && parsed.protocol==='https:' && trusted.protocol==='https:' &&
      parsed.origin===trusted.origin && !parsed.username && !parsed.password && !parsed.hash &&
      !trusted.username && !trusted.password && trusted.pathname==='/' && !trusted.search && !trusted.hash &&
      !isIP(parsed.hostname.replace(/^\[|\]$/g,'')) && parsed.hostname!=='localhost' &&
      (parsed.port==='' || parsed.port==='443') &&
      parsed.pathname===`/storage/v1/object/sign/${ref.bucket}/${ref.object_key}` &&
      typeof parsed.searchParams.get('token')==='string' && parsed.searchParams.get('token').length>0 &&
      Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt)>=now+300000 && Date.parse(expiresAt)<=now+3600000;
  } catch { return false; }
}
module.exports={TYPES,identifier,validReference,validMetadata,validSignedURL};
