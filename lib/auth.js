const crypto = require('crypto');
const {promisify}=require('util');
const store=require('./store');
const scryptAsync=promisify(crypto.scrypt);

const ADMIN_CREDENTIAL_KEY='jjdd:admin:credential:v1';
const ADMIN_SESSION_VERSION_KEY='jjdd:admin:session-version:v1';

function parseCookies(req){
  const raw=req.headers?.cookie||'';
  return Object.fromEntries(raw.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{
    const i=x.indexOf('='); return [decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))];
  }));
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
    if(sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return null;
    const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    if(!payload.exp || Date.now()>payload.exp) return null;
    return payload;
  }catch(e){ return null; }
}
function getSession(req){ return verify(parseCookies(req).jjdd_admin); }
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
  return p.length>=8 && p.length<=128;
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
async function validateAdminSession(req){
  const s=getSession(req);
  if(!s)return null;
  const current=await getAdminSessionVersion();
  if(Number(s.sv||1)!==Number(current||1))return null;
  return s;
}
async function getStoredCredential(){
  // Do not silently downgrade to the old environment password if Redis is unavailable.
  // A changed admin password lives in the persistent store and must remain authoritative.
  store.config();
  return await store.getJSON(ADMIN_CREDENTIAL_KEY);
}
async function loginAllowed(id,password){
  const expectedId=process.env.ADMIN_ID||'admin';
  if(!safeEqual(id,expectedId)) return false;
  const stored=await getStoredCredential();
  if(stored?.passwordHash) return verifyAdminPassword(password,stored.passwordHash);
  const expectedPw=process.env.ADMIN_PASSWORD;
  if(!expectedPw) throw new Error('ADMIN_PASSWORD is not configured');
  return safeEqual(password,expectedPw);
}
async function changeAdminPassword(id,currentPassword,newPassword){
  const expectedId=process.env.ADMIN_ID||'admin';
  if(!safeEqual(id,expectedId)) throw new Error('관리자 계정을 확인할 수 없습니다.');
  if(!validateAdminPassword(newPassword)) throw new Error('새 비밀번호는 8자 이상 128자 이하로 입력해주세요.');
  if(!(await loginAllowed(id,currentPassword))) throw new Error('현재 비밀번호가 올바르지 않습니다.');
  if(await loginAllowed(id,newPassword)) throw new Error('새 비밀번호는 현재 비밀번호와 다르게 입력해주세요.');
  const prev=await getStoredCredential();
  const next={
    schemaVersion:1,
    passwordHash:await hashAdminPassword(newPassword),
    updatedAt:new Date().toISOString(),
    updatedBy:String(id),
    revision:Number(prev?.revision||0)+1
  };
  await store.setJSON(ADMIN_CREDENTIAL_KEY,next);
  const sessionVersion=await bumpAdminSessionVersion();
  return {updatedAt:next.updatedAt,revision:next.revision,sessionVersion};
}
async function adminCredentialStatus(){
  const [stored,sessionVersion]=await Promise.all([getStoredCredential(),getAdminSessionVersion()]);
  return {customPassword:Boolean(stored?.passwordHash),updatedAt:stored?.updatedAt||null,revision:Number(stored?.revision||0),sessionVersion};
}
async function sessionCookie(id){
  const sv=await getAdminSessionVersion();
  const token=sign({id,sv,iat:Date.now(),exp:Date.now()+12*60*60*1000});
  return `jjdd_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`;
}
function clearCookie(){ return 'jjdd_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'; }

module.exports={
  getSession,requireAdmin,validateAdminSession,loginAllowed,sessionCookie,clearCookie,
  validateAdminPassword,hashAdminPassword,verifyAdminPassword,
  changeAdminPassword,adminCredentialStatus,getAdminSessionVersion,bumpAdminSessionVersion,
  ADMIN_CREDENTIAL_KEY,ADMIN_SESSION_VERSION_KEY
};
