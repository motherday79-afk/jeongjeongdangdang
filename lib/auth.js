const crypto = require('crypto');
const {promisify}=require('util');
const store=require('./store');
const scryptAsync=promisify(crypto.scrypt);

const ADMIN_CREDENTIAL_KEY='jjdd:admin:credential:v1';
const ADMIN_SESSION_VERSION_KEY='jjdd:admin:session-version:v1';
const ADMIN_MFA_KEY='jjdd:admin:mfa:v1';
const ADMIN_MFA_PENDING_KEY='jjdd:admin:mfa:pending:v1';
const ADMIN_SESSION_PREFIX='jjdd:admin:session:v2:';
const ADMIN_SESSION_IDLE_SEC=45*60;
const ADMIN_SESSION_ABSOLUTE_MS=8*60*60*1000;
const ADMIN_COOKIE='__Host-jjdd_admin';
const LEGACY_ADMIN_COOKIE='jjdd_admin';

function parseCookies(req){
  const raw=req.headers?.cookie||'';
  const out={};
  for(const x0 of raw.split(';')){
    const x=x0.trim();if(!x)continue;const i=x.indexOf('=');if(i<0)continue;
    try{out[decodeURIComponent(x.slice(0,i))]=decodeURIComponent(x.slice(i+1));}catch(_){}
  }
  return out;
}
function b64url(input){ return Buffer.from(input).toString('base64url'); }
function sign(payload){
  const secret=process.env.ADMIN_SESSION_SECRET;
  if(!secret) throw new Error('ADMIN_SESSION_SECRET is not configured');
  const body=b64url(JSON.stringify(payload));
  const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verify(token){
  try{
    if(!token) return null;
    const [body,sig]=token.split('.');
    const secret=process.env.ADMIN_SESSION_SECRET;
    if(!body||!sig||!secret) return null;
    const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');
    const a=Buffer.from(sig),b=Buffer.from(expected);
    if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return null;
    const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    if(!payload.exp || Date.now()>payload.exp) return null;
    return payload;
  }catch(e){ return null; }
}
function getSession(req){const c=parseCookies(req);return verify(c[ADMIN_COOKIE]||c[LEGACY_ADMIN_COOKIE]);}
function requireAdmin(req,res){
  const s=getSession(req);
  if(!s){ res.status(401).json({ok:false,error:'관리자 로그인이 필요합니다.'}); return null; }
  return s;
}
function safeEqual(a,b){
  const aa=Buffer.from(String(a??'')); const bb=Buffer.from(String(b??''));
  if(aa.length!==bb.length) return false;
  return crypto.timingSafeEqual(aa,bb);
}
function validateAdminPassword(password){
  const p=String(password||'');
  return p.length>=12 && p.length<=128;
}
async function hashAdminPassword(password){
  const N=16384,r=8,p=1,salt=crypto.randomBytes(16).toString('base64url');
  const derived=Buffer.from(await scryptAsync(String(password),salt,64,{N,r,p,maxmem:64*1024*1024}));
  return `scrypt$${N}$${r}$${p}$${salt}$${derived.toString('base64url')}`;
}
async function verifyAdminPassword(password,encoded){
  try{
    const [kind,nS,rS,pS,salt,hash]=String(encoded||'').split('$');
    if(kind!=='scrypt'||!salt||!hash) return false;
    const N=Number(nS),r=Number(rS),p=Number(pS);
    const expected=Buffer.from(hash,'base64url');
    const derived=Buffer.from(await scryptAsync(String(password),salt,expected.length,{N,r,p,maxmem:64*1024*1024}));
    return derived.length===expected.length && crypto.timingSafeEqual(derived,expected);
  }catch(e){return false;}
}
async function getAdminSessionVersion(){
  let v=Number(await store.cmd(['GET',ADMIN_SESSION_VERSION_KEY]).catch(()=>0)||0);
  if(v>0)return v;
  await store.cmd(['SET',ADMIN_SESSION_VERSION_KEY,'1','NX']).catch(()=>{});
  v=Number(await store.cmd(['GET',ADMIN_SESSION_VERSION_KEY]).catch(()=>1)||1);
  return v>0?v:1;
}
async function bumpAdminSessionVersion(){
  const exists=await store.cmd(['EXISTS',ADMIN_SESSION_VERSION_KEY]).catch(()=>0);
  if(!Number(exists))await store.cmd(['SET',ADMIN_SESSION_VERSION_KEY,'1','NX']).catch(()=>{});
  const v=Number(await store.cmd(['INCR',ADMIN_SESSION_VERSION_KEY]));
  return v>0?v:2;
}
function adminSessionKey(sid){return `${ADMIN_SESSION_PREFIX}${String(sid||'')}`;}
async function validateAdminSession(req){
  const s=getSession(req);
  if(!s?.sid)return null; // v2.5.1 deliberately retires old stateless admin cookies.
  const current=await getAdminSessionVersion();
  if(Number(s.sv||0)!==Number(current||1))return null;
  const live=await store.getJSON(adminSessionKey(s.sid)).catch(()=>null);
  if(!live || String(live.id)!==String(s.id) || Number(live.sv)!==Number(current))return null;
  if(Number(live.absoluteExp||0)<=Date.now())return null;
  // Server-side idle timeout. Active use refreshes only the idle TTL, never the absolute expiry.
  const remaining=Math.max(1,Math.min(ADMIN_SESSION_IDLE_SEC,Math.floor((Number(live.absoluteExp)-Date.now())/1000)));
  await store.expire(adminSessionKey(s.sid),remaining).catch(()=>{});
  return s;
}
async function revokeAdminSession(session){if(session?.sid)await store.del(adminSessionKey(session.sid)).catch(()=>{});}
async function getStoredCredential(){
  store.config();
  return await store.getJSON(ADMIN_CREDENTIAL_KEY);
}
async function loginAllowed(id,password){
  const expectedId=process.env.ADMIN_ID||'admin';
  if(!safeEqual(id,expectedId)) return false;
  const p=String(password||'');if(p.length<1||p.length>128)return false;
  const stored=await getStoredCredential();
  if(stored?.passwordHash) return verifyAdminPassword(p,stored.passwordHash);
  const expectedPw=process.env.ADMIN_PASSWORD;
  if(!expectedPw) throw new Error('ADMIN_PASSWORD is not configured');
  return safeEqual(p,expectedPw);
}
async function changeAdminPassword(id,currentPassword,newPassword){
  const expectedId=process.env.ADMIN_ID||'admin';
  if(!safeEqual(id,expectedId)) throw new Error('관리자 계정을 확인할 수 없습니다.');
  if(!validateAdminPassword(newPassword)) throw new Error('새 관리자 비밀번호는 12자 이상 128자 이하로 입력해주세요.');
  if(!(await loginAllowed(id,currentPassword))) throw new Error('현재 비밀번호가 올바르지 않습니다.');
  if(await loginAllowed(id,newPassword)) throw new Error('새 비밀번호는 현재 비밀번호와 다르게 입력해주세요.');
  const prev=await getStoredCredential();
  const next={schemaVersion:2,passwordHash:await hashAdminPassword(newPassword),updatedAt:new Date().toISOString(),updatedBy:String(id),revision:Number(prev?.revision||0)+1};
  await store.setJSON(ADMIN_CREDENTIAL_KEY,next);
  const sessionVersion=await bumpAdminSessionVersion();
  return {updatedAt:next.updatedAt,revision:next.revision,sessionVersion};
}
async function adminCredentialStatus(){
  const [stored,sessionVersion,mfa]=await Promise.all([getStoredCredential(),getAdminSessionVersion(),getAdminMfaStatus()]);
  return {customPassword:Boolean(stored?.passwordHash),updatedAt:stored?.updatedAt||null,revision:Number(stored?.revision||0),sessionVersion,mfaEnabled:mfa.enabled};
}
async function sessionCookie(id,{mfaVerified=false}={}){
  const sv=await getAdminSessionVersion();
  const sid=crypto.randomBytes(24).toString('base64url');
  const now=Date.now(),absoluteExp=now+ADMIN_SESSION_ABSOLUTE_MS;
  await store.setJSON(adminSessionKey(sid),{id:String(id),sv,mfa:Boolean(mfaVerified),createdAt:new Date(now).toISOString(),absoluteExp},ADMIN_SESSION_IDLE_SEC);
  const token=sign({id,sv,sid,mfa:Boolean(mfaVerified),iat:now,exp:absoluteExp});
  return [
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(ADMIN_SESSION_ABSOLUTE_MS/1000)}`,
    `${LEGACY_ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  ];
}
function clearCookie(){return [
  `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  `${LEGACY_ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
];}

// ---- RFC 6238 TOTP MFA ---------------------------------------------------
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf){let bits=0,value=0,out='';for(const byte of Buffer.from(buf)){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=B32[(value>>>(bits-5))&31];bits-=5;}}if(bits>0)out+=B32[(value<<(5-bits))&31];return out;}
function base32Decode(str){let bits=0,value=0,out=[];for(const ch of String(str||'').toUpperCase().replace(/[^A-Z2-7]/g,'')){const idx=B32.indexOf(ch);if(idx<0)continue;value=(value<<5)|idx;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
function mfaEncryptionKey(){const raw=process.env.ADMIN_MFA_ENCRYPTION_KEY||process.env.ADMIN_SESSION_SECRET;if(!raw)throw new Error('ADMIN_MFA_ENCRYPTION_KEY 또는 ADMIN_SESSION_SECRET이 필요합니다.');return crypto.createHash('sha256').update(String(raw)).digest();}
function encryptMfaSecret(secret){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',mfaEncryptionKey(),iv);const data=Buffer.concat([cipher.update(String(secret),'utf8'),cipher.final()]);return {v:1,iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),data:data.toString('base64url')};}
function decryptMfaSecret(enc){try{const d=crypto.createDecipheriv('aes-256-gcm',mfaEncryptionKey(),Buffer.from(enc.iv,'base64url'));d.setAuthTag(Buffer.from(enc.tag,'base64url'));return Buffer.concat([d.update(Buffer.from(enc.data,'base64url')),d.final()]).toString('utf8');}catch(_){return null;}}
function hotp(secret,counter,digits=6){const msg=Buffer.alloc(8);let n=BigInt(counter);for(let i=7;i>=0;i--){msg[i]=Number(n&255n);n>>=8n;}const h=crypto.createHmac('sha1',base32Decode(secret)).update(msg).digest();const off=h[h.length-1]&15;const bin=((h[off]&127)<<24)|((h[off+1]&255)<<16)|((h[off+2]&255)<<8)|(h[off+3]&255);return String(bin%(10**digits)).padStart(digits,'0');}
function totpStep(now=Date.now()){return Math.floor(now/1000/30);}
function verifyTotpSecret(secret,code,{window=1}={}){const c=String(code||'').replace(/\D/g,'');if(c.length!==6)return null;const step=totpStep();for(let d=-window;d<=window;d++){if(safeEqual(hotp(secret,step+d),c))return step+d;}return null;}
function recoveryHash(code){return crypto.createHash('sha256').update(`jjdd-admin-recovery:${String(code||'').trim().toUpperCase()}`).digest('hex');}
function generateRecoveryCodes(){return Array.from({length:8},()=>`${crypto.randomBytes(5).toString('hex').slice(0,5)}-${crypto.randomBytes(5).toString('hex').slice(0,5)}`.toUpperCase());}
async function getAdminMfa(){return await store.getJSON(ADMIN_MFA_KEY).catch(()=>null);}
async function getAdminMfaStatus(){const m=await getAdminMfa();return {enabled:Boolean(m?.enabled&&m?.secretEnc),enabledAt:m?.enabledAt||null,recoveryRemaining:Array.isArray(m?.recoveryHashes)?m.recoveryHashes.length:0};}
async function beginAdminMfaSetup(id,currentPassword){if(!(await loginAllowed(id,currentPassword)))throw new Error('현재 관리자 비밀번호가 올바르지 않습니다.');const secret=base32Encode(crypto.randomBytes(20));const pending={id:String(id),secretEnc:encryptMfaSecret(secret),createdAt:new Date().toISOString()};await store.setJSON(ADMIN_MFA_PENDING_KEY,pending,10*60);const issuer='정참시';const label=`${issuer}:${String(id)}`;const uri=`otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;return {secret,otpauthUri:uri,expiresIn:600};}
async function confirmAdminMfaSetup(id,code){const pending=await store.getJSON(ADMIN_MFA_PENDING_KEY).catch(()=>null);if(!pending||String(pending.id)!==String(id))throw new Error('MFA 설정 시간이 만료되었습니다. 설정을 다시 시작해주세요.');const secret=decryptMfaSecret(pending.secretEnc);const step=verifyTotpSecret(secret,code);if(step===null)throw new Error('인증 앱의 6자리 코드를 확인해주세요.');const recoveryCodes=generateRecoveryCodes();const now=new Date().toISOString();await store.setJSON(ADMIN_MFA_KEY,{schemaVersion:1,enabled:true,secretEnc:pending.secretEnc,recoveryHashes:recoveryCodes.map(recoveryHash),enabledAt:now,updatedAt:now});await store.del(ADMIN_MFA_PENDING_KEY).catch(()=>{});const sessionVersion=await bumpAdminSessionVersion();return {enabled:true,recoveryCodes,sessionVersion};}
async function verifyAdminMfaCode(code,{consumeRecovery=true,consumeTotp=true}={}){const m=await getAdminMfa();if(!m?.enabled||!m?.secretEnc)return {ok:true,method:'DISABLED'};const raw=String(code||'').trim();const secret=decryptMfaSecret(m.secretEnc);const step=verifyTotpSecret(secret,raw);if(step!==null){if(consumeTotp){const once=await store.setNx(`jjdd:admin:mfa:used:${step}`,'1',120).catch(()=>false);if(!once)return {ok:false,reason:'REPLAY'};}return {ok:true,method:'TOTP'};}
  const hash=recoveryHash(raw),idx=(m.recoveryHashes||[]).indexOf(hash);if(idx>=0){if(consumeRecovery){m.recoveryHashes.splice(idx,1);m.updatedAt=new Date().toISOString();await store.setJSON(ADMIN_MFA_KEY,m);}return {ok:true,method:'RECOVERY',recoveryRemaining:(m.recoveryHashes||[]).length};}
  return {ok:false,reason:'INVALID'};
}
async function disableAdminMfa(id,currentPassword,code){if(!(await loginAllowed(id,currentPassword)))throw new Error('현재 관리자 비밀번호가 올바르지 않습니다.');const status=await getAdminMfaStatus();if(!status.enabled)return {enabled:false,sessionVersion:await getAdminSessionVersion()};const v=await verifyAdminMfaCode(code,{consumeTotp:false});if(!v.ok)throw new Error('MFA 인증코드 또는 복구코드를 확인해주세요.');await store.del(ADMIN_MFA_KEY);const sessionVersion=await bumpAdminSessionVersion();return {enabled:false,sessionVersion};}
async function regenerateRecoveryCodes(id,currentPassword,code){if(!(await loginAllowed(id,currentPassword)))throw new Error('현재 관리자 비밀번호가 올바르지 않습니다.');const v=await verifyAdminMfaCode(code,{consumeTotp:false});if(!v.ok)throw new Error('MFA 인증코드 또는 복구코드를 확인해주세요.');const m=await getAdminMfa();if(!m?.enabled)throw new Error('MFA가 활성화되어 있지 않습니다.');const recoveryCodes=generateRecoveryCodes();m.recoveryHashes=recoveryCodes.map(recoveryHash);m.updatedAt=new Date().toISOString();await store.setJSON(ADMIN_MFA_KEY,m);return {recoveryCodes,recoveryRemaining:recoveryCodes.length};}
function securityConfigurationStatus(){
  const len=v=>String(v||'').length;
  return {adminSessionSecretStrong:len(process.env.ADMIN_SESSION_SECRET)>=32,userSessionSecretStrong:len(process.env.USER_SESSION_SECRET)>=32,userEncryptionKeySet:len(process.env.USER_DATA_ENCRYPTION_KEY)>=24,mfaEncryptionKeyDedicated:len(process.env.ADMIN_MFA_ENCRYPTION_KEY)>=24,cronSecretSet:len(process.env.CRON_SECRET)>=24};
}

module.exports={
  getSession,requireAdmin,validateAdminSession,revokeAdminSession,loginAllowed,sessionCookie,clearCookie,
  validateAdminPassword,hashAdminPassword,verifyAdminPassword,
  changeAdminPassword,adminCredentialStatus,getAdminSessionVersion,bumpAdminSessionVersion,
  getAdminMfaStatus,beginAdminMfaSetup,confirmAdminMfaSetup,verifyAdminMfaCode,disableAdminMfa,regenerateRecoveryCodes,securityConfigurationStatus,
  ADMIN_CREDENTIAL_KEY,ADMIN_SESSION_VERSION_KEY,ADMIN_MFA_KEY,ADMIN_SESSION_IDLE_SEC,ADMIN_SESSION_ABSOLUTE_MS
};
