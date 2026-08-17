const crypto=require('crypto');
const store=require('./store');

const ADMIN_AUDIT_KEY='jjdd:security:admin-audit:v1';
const ADMIN_AUDIT_TTL=90*24*60*60;
const ADMIN_FAIL_LIMIT=5;
const ADMIN_FAIL_TTL=10*60;
const ADMIN_BURST_LIMIT=12;
const ADMIN_BURST_TTL=10*60;

function clientIp(req){
  return String(req?.headers?.['x-forwarded-for']||req?.headers?.['x-real-ip']||req?.socket?.remoteAddress||'unknown').split(',')[0].trim();
}
function ipHash(req){return crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0,24)}
function maskIp(ip){
  const v=String(ip||'unknown');
  if(v.includes('.')){const p=v.split('.');if(p.length===4)return `${p[0]}.${p[1]}.${p[2]}.x`;}
  if(v.includes(':')){const p=v.split(':').filter(Boolean);return `${p.slice(0,3).join(':')}:…`;}
  return 'unknown';
}
function ua(req){return String(req?.headers?.['user-agent']||'unknown').slice(0,220)}
function hashPart(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex').slice(0,20)}
async function counter(key,ttlSec){
  const n=Number(await store.cmd(['INCR',key]));
  if(n===1)await store.cmd(['EXPIRE',key,String(ttlSec)]).catch(()=>{});
  const ttl=Number(await store.cmd(['TTL',key]).catch(()=>ttlSec));
  return {count:n,retryAfter:ttl>0?ttl:ttlSec};
}
async function rateLimit(req,bucket,limit,ttlSec,discriminator=''){
  const key=`jjdd:security:rate:${bucket}:${ipHash(req)}:${hashPart(discriminator)}`;
  const r=await counter(key,ttlSec);
  return {...r,ok:r.count<=limit,limit};
}
async function globalApiGuard(req,route){
  const method=String(req?.method||'GET').toUpperCase();
  if(String(route||'').startsWith('cron/'))return {ok:true};
  if(String(route||'').startsWith('admin/'))return {ok:true};
  const write=!['GET','HEAD','OPTIONS'].includes(method);
  const limit=write?180:600;
  const ttlSec=60;
  return rateLimit(req,write?'api-write':'api-read',limit,ttlSec);
}
function adminFailKey(req,id){return `jjdd:security:admin-fail:${ipHash(req)}:${hashPart(String(id||'').trim().toLowerCase())}`}
async function adminLoginPrecheck(req,id){
  const burst=await rateLimit(req,'admin-login-burst',ADMIN_BURST_LIMIT,ADMIN_BURST_TTL,String(id||'').trim().toLowerCase());
  if(!burst.ok)return {ok:false,reason:'RATE_LIMIT',retryAfter:burst.retryAfter};
  const key=adminFailKey(req,id);
  const fails=Number(await store.cmd(['GET',key]).catch(()=>0)||0);
  const ttl=Number(await store.cmd(['TTL',key]).catch(()=>ADMIN_FAIL_TTL));
  if(fails>=ADMIN_FAIL_LIMIT)return {ok:false,reason:'LOCKED',retryAfter:ttl>0?ttl:ADMIN_FAIL_TTL};
  return {ok:true,fails};
}
async function adminLoginFailed(req,id){
  const key=adminFailKey(req,id);
  const r=await counter(key,ADMIN_FAIL_TTL);
  await recordAdminAudit(req,{type:r.count>=ADMIN_FAIL_LIMIT?'LOGIN_LOCKED':'LOGIN_FAILED',adminId:String(id||'').slice(0,80),success:false,detail:`failure ${Math.min(r.count,ADMIN_FAIL_LIMIT)}/${ADMIN_FAIL_LIMIT}`});
  return {count:r.count,locked:r.count>=ADMIN_FAIL_LIMIT,retryAfter:r.retryAfter};
}
async function adminLoginSucceeded(req,id){
  await store.cmd(['DEL',adminFailKey(req,id)]).catch(()=>{});
  await recordAdminAudit(req,{type:'LOGIN_SUCCESS',adminId:String(id||'').slice(0,80),success:true});
}
async function recordAdminAudit(req,event={}){
  const row={
    at:new Date().toISOString(),
    type:String(event.type||'SECURITY_EVENT').slice(0,60),
    success:event.success!==false,
    adminId:String(event.adminId||'admin').slice(0,80),
    ip:maskIp(clientIp(req)),
    ipHash:ipHash(req),
    userAgent:ua(req),
    detail:String(event.detail||'').slice(0,240)
  };
  await store.lpush(ADMIN_AUDIT_KEY,JSON.stringify(row));
  await Promise.all([store.ltrim(ADMIN_AUDIT_KEY,0,199),store.expire(ADMIN_AUDIT_KEY,ADMIN_AUDIT_TTL)]).catch(()=>{});
  return row;
}
async function listAdminAudit(limit=80){
  const rows=await store.lrange(ADMIN_AUDIT_KEY,0,Math.max(0,Math.min(199,Number(limit||80)-1))).catch(()=>[]);
  return (rows||[]).map(v=>{try{return JSON.parse(v)}catch(_){return null}}).filter(Boolean);
}

function requestOriginAllowed(req){
  const method=String(req?.method||'GET').toUpperCase();
  if(['GET','HEAD','OPTIONS'].includes(method))return {ok:true};
  const site=String(req?.headers?.['sec-fetch-site']||'').toLowerCase();
  if(site==='cross-site')return {ok:false,reason:'CROSS_SITE'};
  const host=String(req?.headers?.['x-forwarded-host']||req?.headers?.host||'').split(',')[0].trim().toLowerCase();
  const proto=String(req?.headers?.['x-forwarded-proto']||(host.startsWith('localhost')||host.startsWith('127.0.0.1')?'http':'https')).split(',')[0].trim().toLowerCase();
  const expected=host?`${proto}://${host}`:'';
  const origin=String(req?.headers?.origin||'').trim();
  if(origin&&expected){try{if(new URL(origin).origin.toLowerCase()!==expected)return {ok:false,reason:'ORIGIN_MISMATCH'};}catch(_){return {ok:false,reason:'ORIGIN_INVALID'};}}
  const referer=String(req?.headers?.referer||'').trim();
  if(!origin&&referer&&expected){try{if(new URL(referer).origin.toLowerCase()!==expected)return {ok:false,reason:'REFERER_MISMATCH'};}catch(_){return {ok:false,reason:'REFERER_INVALID'};}}
  return {ok:true};
}
async function identifierRateLimit(req,bucket,identifier,limit,ttlSec){
  const key=`jjdd:security:idrate:${bucket}:${hashPart(String(identifier||'').trim().toLowerCase())}`;
  const r=await counter(key,ttlSec);return {...r,ok:r.count<=limit,limit};
}

function applyRateLimitResponse(res,guard,message='요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'){
  const retry=Math.max(1,Number(guard?.retryAfter||60));
  res.setHeader('Retry-After',String(retry));
  return res.status(429).json({ok:false,error:message,retryAfter:retry});
}

module.exports={
  ADMIN_FAIL_LIMIT,ADMIN_FAIL_TTL,ADMIN_BURST_LIMIT,ADMIN_BURST_TTL,
  clientIp,ipHash,maskIp,rateLimit,identifierRateLimit,globalApiGuard,requestOriginAllowed,
  adminLoginPrecheck,adminLoginFailed,adminLoginSucceeded,
  recordAdminAudit,listAdminAudit,applyRateLimitResponse
};
