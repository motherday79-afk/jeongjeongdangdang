const crypto = require('crypto');
const { promisify } = require('util');
const { cmd, getJSON, setJSON, parseJSONValue } = require('./store');
const REGION_DATA=require('../data/regions_kr_2026.json');

const scryptAsync = promisify(crypto.scrypt);
const ROLES = ['FREE','PLUS','PRO','ADMIN'];
const AGREEMENT_VERSIONS = {
  terms: '2026-08-17.v5',
  privacy: '2026-08-17.v5',
  sensitivePreference: '2026-08-16.v2'
};
const USER_SET_KEY = 'jjdd:users';
const PARTY_OPTIONS=['더불어민주당','국민의힘','조국혁신당','개혁신당','진보당','기본소득당','사회민주당','무소속','기타','특정 정당 없음'];
const REGION_MAP=new Map((REGION_DATA.regions||[]).map(r=>[String(r.code),r]));

function nowIso(){ return new Date().toISOString(); }
function normalizeEmail(v){ return String(v||'').trim().toLowerCase(); }
function normalizeUsername(v){ return String(v||'').trim().toLowerCase(); }
function normalizeNicknameKey(v){ return String(v||'').trim().normalize('NFKC').toLowerCase(); }
function normalizePhone(v){ return String(v||'').replace(/\D/g,'').slice(0,11); }
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
  const token=signSession({uid:user.id,sv:Number(user.sessionVersion||1),iat:Date.now(),exp:Date.now()+maxAge*1000});
  return [`__Host-jjdd_user=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,`jjdd_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`];
}
function clearSessionCookie(){ return [`__Host-jjdd_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,`jjdd_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`]; }

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
function validateRegion(regionMain,regionSub,regionDistrict){
  const main=String(regionMain||'').trim(),sub=String(regionSub||'').trim(),district=String(regionDistrict||'').trim();
  const r=REGION_MAP.get(main);if(!r)return null;
  const subs=Array.isArray(r.subregions)?r.subregions:[];
  if(subs.length && !subs.includes(sub))return null;
  if(!subs.length && sub)return null;
  const districts=Array.isArray(r.districts?.[sub])?r.districts[sub]:[];
  if(districts.length && !districts.includes(district))return null;
  if(!districts.length && district)return null;
  const display=[r.label,sub,district].filter(Boolean).join(' ');
  return {main,mainLabel:r.label,fullName:r.fullName,sub:sub||null,district:district||null,display};
}
function validatePhone(phone){const p=normalizePhone(phone);return /^0\d{8,10}$/.test(p);}
function validatePartyPreference(party){return PARTY_OPTIONS.includes(String(party||'').trim());}

function publicUser(user,{includePreference=true,includePrivateProfile=true}={}){
  if(!user) return null;
  const out={
    id:user.id,
    username:user.username||null,
    email:user.email||null,
    nickname:user.nickname,
    role:ROLES.includes(user.role)?user.role:'FREE',
    status:user.status||'ACTIVE',
    createdAt:user.createdAt,
    updatedAt:user.updatedAt,
    lastLoginAt:user.lastLoginAt||null,
    agreements:user.agreements||{},
    notifications:{enabled:user.notificationsEnabled===true,updatedAt:user.notificationsUpdatedAt||null},
    capabilities:capabilities(user.role)
  };
  if(includePrivateProfile){
    const pd=decryptSensitive(user.profileDataEnc)||{};
    out.phone=pd.phone||null;
    out.region=pd.region||null;
  }
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
  const normalized=normalizeEmail(email);if(!normalized)return null;
  const id=await cmd(['GET',emailIndexKey(normalized)]);
  return id ? getUserById(id) : null;
}
async function findUsersByNickname(nickname,{limit=3,excludeId=null}={}){
  const key=normalizeNicknameKey(nickname);if(!key)return [];
  const ids=(await cmd(['SMEMBERS',USER_SET_KEY]).catch(()=>[]))||[];
  const out=[];
  for(let i=0;i<ids.length;i+=300){
    const chunk=ids.slice(i,i+300);if(!chunk.length)continue;
    let vals=null;try{vals=await cmd(['MGET',...chunk.map(userKey)]);}catch(_){}
    if(!Array.isArray(vals))vals=await Promise.all(chunk.map(id=>getUserById(id).catch(()=>null)));
    for(let j=0;j<chunk.length;j++){const u=parseJSONValue(vals[j])||vals[j];if(!u||String(u.id)===String(excludeId||''))continue;if(normalizeNicknameKey(u.nickname)===key){out.push(u);if(out.length>=limit)return out;}}
  }
  return out;
}
async function getUserByNickname(nickname){const rows=await findUsersByNickname(nickname,{limit:2});if(rows.length>1){const e=new Error('같은 닉네임을 사용하는 회원이 있어 추천인을 특정할 수 없습니다. 추천인에게 닉네임 변경을 요청해주세요.');e.code='AMBIGUOUS_NICKNAME';throw e;}return rows[0]||null;}
async function ensureNicknameAvailable(nickname,excludeId=null){const rows=await findUsersByNickname(nickname,{limit:1,excludeId});if(rows.length)throw new Error('이미 사용 중인 닉네임입니다. 다른 닉네임을 선택해주세요.');return true;}
async function authenticate(req){
  const cookies=parseCookies(req);
  const token=cookies['__Host-jjdd_user']||cookies.jjdd_user;
  const session=verifySessionToken(token);
  if(!session) return null;
  const user=await getUserById(session.uid);
  if(!user || !['ACTIVE'].includes(String(user.status||'ACTIVE')) || Number(user.sessionVersion||1)!==Number(session.sv||1)) return null;
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
async function createUser({username,email,password,phone,regionMain,regionSub,regionDistrict,partyPreference,sensitiveConsent,agreeTerms,agreePrivacy,age14}){
  const normalizedUsername=normalizeUsername(username);
  const normalizedEmail=normalizeEmail(email);
  const normalizedPhone=normalizePhone(phone);
  const region=validateRegion(regionMain,regionSub,regionDistrict);
  const party=String(partyPreference||'').trim();
  if(!validateUsername(normalizedUsername)) throw new Error('아이디는 영문·숫자·밑줄(_)만 사용해 4~20자로 입력해주세요.');
  await ensureNicknameAvailable(normalizedUsername);
  if(normalizedEmail && !validateEmail(normalizedEmail)) throw new Error('이메일 형식을 확인해주세요.');
  if(!validatePassword(password)) throw new Error('비밀번호는 조합 조건 없이 8자 이상 128자 이하로 입력해주세요.');
  if(!validatePhone(normalizedPhone)) throw new Error('전화번호를 확인해주세요.');
  if(!region) throw new Error('지역을 시·도부터 시·군·구까지 선택해주세요.');
  if(!validatePartyPreference(party)) throw new Error('선호정당을 선택해주세요.');
  if(sensitiveConsent!==true) throw new Error('선호정당 저장을 위한 정치적 관심정보 수집·이용 동의가 필요합니다.');
  if(!agreeTerms || !agreePrivacy) throw new Error('필수 약관에 동의해주세요.');
  if(!age14) throw new Error('현재 1차 빌드는 만 14세 이상 회원가입만 지원합니다.');
  const id=crypto.randomUUID();
  const usernameIdx=usernameIndexKey(normalizedUsername);
  const emailIdx=normalizedEmail?emailIndexKey(normalizedEmail):null;
  const usernameReserved=await cmd(['SET',usernameIdx,id,'NX']);
  if(usernameReserved!=='OK') throw new Error('이미 사용 중인 아이디입니다.');
  let emailReserved=false;
  if(emailIdx){
    const r=await cmd(['SET',emailIdx,id,'NX']);
    if(r!=='OK'){
      await cmd(['DEL',usernameIdx]).catch(()=>{});
      throw new Error('이미 가입된 이메일입니다.');
    }
    emailReserved=true;
  }
  try{
    const ts=nowIso();
    const user={
      id,username:normalizedUsername,email:normalizedEmail||null,nickname:normalizedUsername,role:'FREE',status:'ACTIVE',
      passwordHash:await hashPassword(password),sessionVersion:1,
      agreements:{
        terms:{version:AGREEMENT_VERSIONS.terms,agreedAt:ts},
        privacy:{version:AGREEMENT_VERSIONS.privacy,agreedAt:ts},
        sensitivePreference:{version:AGREEMENT_VERSIONS.sensitivePreference,agreedAt:ts},
        age14:{confirmedAt:ts}
      },
      profileDataEnc:encryptSensitive({phone:normalizedPhone,region}),
      politicalPreferenceEnc:encryptSensitive({party,sensitiveConsent:true,consentVersion:AGREEMENT_VERSIONS.sensitivePreference,consentAt:ts}),
      plusDataEnc:null,
      createdAt:ts,updatedAt:ts,lastLoginAt:ts
    };
    await setJSON(userKey(id),user);
    await cmd(['SADD',USER_SET_KEY,id]);
    return user;
  }catch(e){
    await cmd(['DEL',usernameIdx]).catch(()=>{});
    if(emailReserved&&emailIdx)await cmd(['DEL',emailIdx]).catch(()=>{});
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
  ROLES,AGREEMENT_VERSIONS,PARTY_OPTIONS,REGION_DATA,USER_SET_KEY,userKey,usernameIndexKey,emailIndexKey,normalizeUsername,normalizeNicknameKey,normalizeEmail,normalizePhone,
  hashPassword,verifyPassword,encryptSensitive,decryptSensitive,publicUser,capabilities,
  getUserById,getUserByUsername,getUserByEmail,getUserByNickname,findUsersByNickname,ensureNicknameAvailable,authenticate,requireUser,createUser,claimUsername,saveUser,
  sessionCookie,clearSessionCookie,validateUsername,validateEmail,validateNickname,validatePassword,validatePhone,validateRegion,validatePartyPreference,rateLimit
};
