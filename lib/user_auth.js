const crypto = require('crypto');
const { promisify } = require('util');
const { cmd, getJSON, setJSON } = require('./store');

const scryptAsync = promisify(crypto.scrypt);
const ROLES = ['FREE','PLUS','PRO','ADMIN'];
const AGREEMENT_VERSIONS = {
  terms: '2026-08-15.v3',
  privacy: '2026-08-15.v3',
  sensitivePreference: '2026-08-14.v1'
};
const USER_SET_KEY = 'jjdd:users';

function nowIso(){ return new Date().toISOString(); }
function normalizeEmail(v){ return String(v||'').trim().toLowerCase(); }
function normalizeUsername(v){ return String(v||'').trim().toLowerCase(); }
function usernameIndexKey(username){
  return `jjdd:user:username:${crypto.createHash('sha256').update(normalizeUsername(username)).digest('hex')}`;
}
function emailIndexKey(email){
  return `jjdd:user:email:${crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex')}`;
}
function userKey(id){ return `jjdd:user:${String(id||'')}`; }
function parseCookies(req){
  const raw=req.headers?.cookie||'';
  const out={};
  for(const part of raw.split(';')){
    const x=part.trim(); if(!x) continue;
    const i=x.indexOf('='); if(i<0) continue;
    try{ out[decodeURIComponent(x.slice(0,i))]=decodeURIComponent(x.slice(i+1)); }catch(_){ }
  }
  return out;
}
function secret(){
  const s=process.env.USER_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if(!s) throw new Error('USER_SESSION_SECRET is not configured');
  return s;
}
function b64url(v){ return Buffer.from(v).toString('base64url'); }
function signSession(payload){
  const body=b64url(JSON.stringify(payload));
  const sig=crypto.createHmac('sha256',secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifySessionToken(token){
  try{
    if(!token) return null;
    const [body,sig]=String(token).split('.');
    if(!body||!sig) return null;
    const expected=crypto.createHmac('sha256',secret()).update(body).digest('base64url');
    const a=Buffer.from(sig), b=Buffer.from(expected);
    if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return null;
    const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    if(!payload.uid || !payload.exp || Date.now()>payload.exp) return null;
    return payload;
  }catch(_){ return null; }
}
function sessionCookie(user){
  const maxAge=30*24*60*60;
  const token=signSession({uid:user.id,sv:Number(user.sessionVersion||1),exp:Date.now()+maxAge*1000});
  return `jjdd_user=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function clearSessionCookie(){ return 'jjdd_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'; }

async function hashPassword(password){
  const salt=crypto.randomBytes(16);
  const N=16384,r=8,p=1;
  const derived=await scryptAsync(String(password),salt,64,{N,r,p,maxmem:64*1024*1024});
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}
async function verifyPassword(password,encoded){
  try{
    const [kind,Ns,rs,ps,salt64,hash64]=String(encoded||'').split('$');
    if(kind!=='scrypt') return false;
    const N=Number(Ns),r=Number(rs),p=Number(ps);
    const salt=Buffer.from(salt64,'base64url'), expected=Buffer.from(hash64,'base64url');
    const derived=Buffer.from(await scryptAsync(String(password),salt,expected.length,{N,r,p,maxmem:64*1024*1024}));
    return derived.length===expected.length && crypto.timingSafeEqual(derived,expected);
  }catch(_){ return false; }
}

function encryptionKey(){
  const raw=process.env.USER_DATA_ENCRYPTION_KEY || process.env.USER_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if(!raw) throw new Error('USER_DATA_ENCRYPTION_KEY is not configured');
  return crypto.createHash('sha256').update(String(raw)).digest();
}
function encryptSensitive(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey(),iv);
  const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return {v:1,alg:'A256GCM',iv:iv.toString('base64url'),tag:tag.toString('base64url'),data:body.toString('base64url')};
}
function decryptSensitive(payload){
  try{
    if(!payload || payload.v!==1) return null;
    const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(payload.iv,'base64url'));
    decipher.setAuthTag(Buffer.from(payload.tag,'base64url'));
    const clear=Buffer.concat([decipher.update(Buffer.from(payload.data,'base64url')),decipher.final()]).toString('utf8');
    return JSON.parse(clear);
  }catch(_){ return null; }
}

function publicUser(user,{includePreference=true}={}){
  if(!user) return null;
  const out={
    id:user.id,
    username:user.username||null,
    email:user.email,
    nickname:user.nickname,
    role:ROLES.includes(user.role)?user.role:'FREE',
    status:user.status||'ACTIVE',
    createdAt:user.createdAt,
    updatedAt:user.updatedAt,
    lastLoginAt:user.lastLoginAt||null,
    agreements:user.agreements||{},
    capabilities:capabilities(user.role)
  };
  if(includePreference){
    const pref=decryptSensitive(user.politicalPreferenceEnc);
    out.preference={
      party:pref?.party||null,
      sensitiveConsent:Boolean(pref?.sensitiveConsent),
      consentVersion:pref?.consentVersion||null,
      consentAt:pref?.consentAt||null
    };
  }
  return out;
}
function capabilities(role){
  const r=ROLES.includes(role)?role:'FREE';
  return {
    free:true,
    plus:['PLUS','PRO','ADMIN'].includes(r),
    pro:['PRO','ADMIN'].includes(r),
    admin:r==='ADMIN'
  };
}
async function getUserById(id){ return id ? getJSON(userKey(id)) : null; }
async function getUserByUsername(username){
  const normalized=normalizeUsername(username);
  if(!normalized) return null;
  const id=await cmd(['GET',usernameIndexKey(normalized)]);
  return id ? getUserById(id) : null;
}
async function getUserByEmail(email){
  const id=await cmd(['GET',emailIndexKey(email)]);
  return id ? getUserById(id) : null;
}
async function authenticate(req){
  const token=parseCookies(req).jjdd_user;
  const session=verifySessionToken(token);
  if(!session) return null;
  const user=await getUserById(session.uid);
  if(!user || user.status==='DELETED' || Number(user.sessionVersion||1)!==Number(session.sv||1)) return null;
  return user;
}
async function requireUser(req,res){
  const user=await authenticate(req);
  if(!user){ res.status(401).json({ok:false,error:'로그인이 필요합니다.'}); return null; }
  return user;
}
function validateUsername(username){
  const u=normalizeUsername(username);
  return u.length>=4 && u.length<=20 && /^[a-z0-9_]+$/.test(u);
}
function validateEmail(email){
  const e=normalizeEmail(email);
  return e.length<=190 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
function validateNickname(nickname){
  const n=String(nickname||'').trim();
  return n.length>=2 && n.length<=20 && !/[<>]/.test(n);
}
function validatePassword(password){
  const p=String(password||'');
  return p.length>=8 && p.length<=128;
}
async function createUser({username,email,password,nickname,agreeTerms,agreePrivacy,age14}){
  const normalizedUsername=normalizeUsername(username);
  const normalized=normalizeEmail(email);
  if(!validateUsername(normalizedUsername)) throw new Error('아이디는 영문·숫자·밑줄(_)만 사용해 4~20자로 입력해주세요.');
  if(!validateEmail(normalized)) throw new Error('이메일 형식을 확인해주세요.');
  if(!validatePassword(password)) throw new Error('비밀번호는 조합 조건 없이 8자 이상 128자 이하로 입력해주세요.');
  if(!validateNickname(nickname)) throw new Error('닉네임은 2~20자로 입력해주세요.');
  if(!agreeTerms || !agreePrivacy) throw new Error('필수 약관에 동의해주세요.');
  if(!age14) throw new Error('현재 1차 빌드는 만 14세 이상 회원가입만 지원합니다.');
  const id=crypto.randomUUID();
  const usernameIdx=usernameIndexKey(normalizedUsername);
  const emailIdx=emailIndexKey(normalized);
  const usernameReserved=await cmd(['SET',usernameIdx,id,'NX']);
  if(usernameReserved!=='OK') throw new Error('이미 사용 중인 아이디입니다.');
  const emailReserved=await cmd(['SET',emailIdx,id,'NX']);
  if(emailReserved!=='OK'){
    await cmd(['DEL',usernameIdx]).catch(()=>{});
    throw new Error('이미 가입된 이메일입니다.');
  }
  try{
    const ts=nowIso();
    const user={
      id,username:normalizedUsername,email:normalized,nickname:String(nickname).trim(),role:'FREE',status:'ACTIVE',
      passwordHash:await hashPassword(password),sessionVersion:1,
      agreements:{
        terms:{version:AGREEMENT_VERSIONS.terms,agreedAt:ts},
        privacy:{version:AGREEMENT_VERSIONS.privacy,agreedAt:ts},
        age14:{confirmedAt:ts}
      },
      politicalPreferenceEnc:null,
      plusDataEnc:null,
      createdAt:ts,updatedAt:ts,lastLoginAt:ts
    };
    await setJSON(userKey(id),user);
    await cmd(['SADD',USER_SET_KEY,id]);
    return user;
  }catch(e){
    await cmd(['DEL',usernameIdx]).catch(()=>{});
    await cmd(['DEL',emailIdx]).catch(()=>{});
    throw e;
  }
}
async function claimUsername(user,username){
  if(!user) throw new Error('회원을 찾을 수 없습니다.');
  const normalized=normalizeUsername(username);
  if(!validateUsername(normalized)) throw new Error('아이디는 영문·숫자·밑줄(_)만 사용해 4~20자로 입력해주세요.');
  if(user.username){
    if(normalizeUsername(user.username)!==normalized) throw new Error('아이디는 가입 후 변경할 수 없습니다.');
    return user;
  }
  const idx=usernameIndexKey(normalized);
  const reserved=await cmd(['SET',idx,user.id,'NX']);
  if(reserved!=='OK') throw new Error('이미 사용 중인 아이디입니다.');
  user.username=normalized;
  try{ await saveUser(user); return user; }
  catch(e){ await cmd(['DEL',idx]).catch(()=>{}); user.username=null; throw e; }
}
async function saveUser(user){ user.updatedAt=nowIso(); await setJSON(userKey(user.id),user); return user; }

function ipFingerprint(req){
  const ip=String(req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0,24);
}
async function rateLimit(req,bucket,limit,ttlSec){
  const key=`jjdd:rate:${bucket}:${ipFingerprint(req)}`;
  const count=Number(await cmd(['INCR',key]));
  if(count===1) await cmd(['EXPIRE',key,String(ttlSec)]).catch(()=>{});
  return {ok:count<=limit,count};
}

module.exports={
  ROLES,AGREEMENT_VERSIONS,USER_SET_KEY,userKey,usernameIndexKey,emailIndexKey,normalizeUsername,normalizeEmail,
  hashPassword,verifyPassword,encryptSensitive,decryptSensitive,publicUser,capabilities,
  getUserById,getUserByUsername,getUserByEmail,authenticate,requireUser,createUser,claimUsername,saveUser,
  sessionCookie,clearSessionCookie,validateUsername,validateEmail,validateNickname,validatePassword,rateLimit
};
