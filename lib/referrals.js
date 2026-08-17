const {cmd,getJSON,setJSON,parseJSONValue}=require('./store');
const {getUserById,getUserByNickname,publicUser,encryptSensitive,decryptSensitive}=require('./user_auth');
const {getActivity,setCounter,getProfile}=require('./badges');

const RELATION_SET='jjdd:referral:relations:v1';
const SECRET_CONFIG_KEY='jjdd:secret:collection:config:v1';
const GIFT_SET='jjdd:secret:gifts:v1';
const VALID_AGE_MS=7*24*60*60*1000;
const VALID_ACTIVE_DAYS=3;
const GIFT_STATUSES=['APPLIED','PREPARING','SHIPPED','DELIVERED','REJECTED'];

function relationKey(referredId){return `jjdd:referral:user:${String(referredId)}`}
function referredSetKey(referrerId){return `jjdd:referral:referrer:${String(referrerId)}`}
function validSetKey(referrerId){return `jjdd:referral:valid:${String(referrerId)}`}
function giftKey(seasonId,userId){return `jjdd:secret:gift:${String(seasonId)}:${String(userId)}`}
function giftUserSetKey(userId){return `jjdd:secret:gift:user:${String(userId)}`}
function nowIso(){return new Date().toISOString()}
function uniqueDays(a){return new Set((a?.attendanceDays||[]).filter(Boolean)).size}
function cleanText(v,n=120){return String(v||'').trim().slice(0,n)}
function publicMember(u){if(!u)return null;const p=publicUser(u,{includePreference:false,includePrivateProfile:false});return {id:p.id,nickname:p.nickname,username:p.username,createdAt:p.createdAt,status:p.status}}

async function resolveReferrerNickname(nickname){
  const nick=cleanText(nickname,20);if(!nick)return null;
  const u=await getUserByNickname(nick);
  if(!u||String(u.status||'ACTIVE')!=='ACTIVE')throw new Error('추천인 닉네임을 찾을 수 없습니다. 닉네임을 다시 확인해주세요.');
  return u;
}

async function syncReferrerCounters(referrerId){
  if(!referrerId)return {total:0,valid:0};
  const [total,valid]=await Promise.all([
    cmd(['SCARD',referredSetKey(referrerId)]).catch(()=>0),
    cmd(['SCARD',validSetKey(referrerId)]).catch(()=>0)
  ]);
  await Promise.all([
    setCounter(referrerId,'referralTotal',Number(total||0)).catch(()=>{}),
    setCounter(referrerId,'referralValid',Number(valid||0)).catch(()=>{})
  ]);
  return {total:Number(total||0),valid:Number(valid||0)};
}

async function createReferral({referredId,referrerId,referrerNickname}){
  const child=String(referredId||''),parent=String(referrerId||'');
  if(!child||!parent)return null;
  if(child===parent)throw new Error('본인을 추천인으로 등록할 수 없습니다.');
  const existing=await getJSON(relationKey(child)).catch(()=>null);if(existing)return existing;
  const rel={schemaVersion:1,referredId:child,referrerId:parent,referrerNicknameAtSignup:cleanText(referrerNickname,20),status:'PENDING',source:'SIGNUP_NICKNAME',createdAt:nowIso(),validatedAt:null,invalidatedAt:null,adminOverride:null,adminNote:null,updatedAt:nowIso()};
  await setJSON(relationKey(child),rel);
  await Promise.all([cmd(['SADD',RELATION_SET,child]),cmd(['SADD',referredSetKey(parent),child])]);
  await syncReferrerCounters(parent);
  return rel;
}

async function getRelation(referredId){return referredId?getJSON(relationKey(referredId)).catch(()=>null):null}

async function evaluateReferralForUser(referredId,{force=false}={}){
  const rel=await getRelation(referredId);if(!rel)return null;
  if(rel.adminOverride&&!force)return rel;
  const user=await getUserById(referredId);if(!user)return rel;
  const activity=await getActivity(referredId).catch(()=>null);
  const age=Date.now()-Date.parse(user.createdAt||rel.createdAt||0);
  const days=uniqueDays(activity);
  const qualifies=String(user.status||'ACTIVE')==='ACTIVE'&&Number.isFinite(age)&&age>=VALID_AGE_MS&&days>=VALID_ACTIVE_DAYS;
  const before=rel.status;
  if(qualifies){rel.status='VALID';rel.validatedAt=rel.validatedAt||nowIso();rel.invalidatedAt=null;await cmd(['SADD',validSetKey(rel.referrerId),rel.referredId]);}
  else if(before!=='INVALID'){rel.status='PENDING';await cmd(['SREM',validSetKey(rel.referrerId),rel.referredId]);}
  rel.activityDays=days;rel.ageDays=Math.max(0,Math.floor(age/86400000)||0);rel.updatedAt=nowIso();
  await setJSON(relationKey(rel.referredId),rel);
  if(before!==rel.status)await syncReferrerCounters(rel.referrerId);else if(qualifies)await syncReferrerCounters(rel.referrerId);
  return rel;
}

async function getReferralSummary(referrerId,{includeMembers=true}={}){
  const ids=(await cmd(['SMEMBERS',referredSetKey(referrerId)]).catch(()=>[]))||[];
  const validSet=new Set((await cmd(['SMEMBERS',validSetKey(referrerId)]).catch(()=>[]))||[]);
  const rows=[];
  if(includeMembers){
    for(const id of ids.slice(0,200)){
      const [rel,u]=await Promise.all([getRelation(id),getUserById(id).catch(()=>null)]);
      if(!rel)continue;rows.push({referredId:id,nickname:u?.nickname||'탈퇴 회원',joinedAt:u?.createdAt||rel.createdAt,status:rel.status||'PENDING',valid:validSet.has(String(id)),activityDays:Number(rel.activityDays||0),ageDays:Number(rel.ageDays||0)});
    }
    rows.sort((a,b)=>String(b.joinedAt||'').localeCompare(String(a.joinedAt||'')));
  }
  return {total:ids.length,valid:validSet.size,pending:Math.max(0,ids.length-validSet.size),members:rows};
}

function defaultSecretConfig(){return {enabled:true,id:'SECRET-S1-2026',title:'HIDDEN COLLECTION · SEASON 01',subtitle:'정참시의 비밀을 모두 발견한 시민에게 실제 선물을 보냅니다.',startAt:'2026-08-17T00:00:00+09:00',endAt:'2026-12-31T23:59:59+09:00',giftName:'정참시 SECRET GIFT',requiredBadgeIds:['lunch_secret','cinderella_secret','earlybird_secret','owl_secret','invisible_hand'],updatedAt:null}}
async function getSecretConfig(){return (await getJSON(SECRET_CONFIG_KEY).catch(()=>null))||defaultSecretConfig()}
async function saveSecretConfig(input){
  const cur=await getSecretConfig();
  const ids=Array.isArray(input?.requiredBadgeIds)?[...new Set(input.requiredBadgeIds.map(String).filter(Boolean))].slice(0,30):cur.requiredBadgeIds;
  const next={...cur,enabled:input?.enabled!==false,id:cleanText(input?.id||cur.id,60),title:cleanText(input?.title||cur.title,100),subtitle:cleanText(input?.subtitle||cur.subtitle,220),startAt:String(input?.startAt||cur.startAt),endAt:String(input?.endAt||cur.endAt),giftName:cleanText(input?.giftName||cur.giftName,100),requiredBadgeIds:ids.length?ids:cur.requiredBadgeIds,updatedAt:nowIso()};
  if(!Date.parse(next.startAt)||!Date.parse(next.endAt)||Date.parse(next.endAt)<=Date.parse(next.startAt))throw new Error('SECRET COLLECTION 시작/종료 일시를 확인해주세요.');
  await setJSON(SECRET_CONFIG_KEY,next);return next;
}

async function getGiftClaim(seasonId,userId,{admin=false}={}){
  const c=await getJSON(giftKey(seasonId,userId)).catch(()=>null);if(!c)return null;
  const out={...c,shipping:undefined};if(admin)out.shipping=decryptSensitive(c.shippingEnc)||null;delete out.shippingEnc;return out;
}

async function getSecretCollectionStatus(userId){
  const [config,profile]=await Promise.all([getSecretConfig(),getProfile(userId)]);
  const earnedMap=new Map((profile.fixed||[]).filter(x=>x.earned).map(x=>[String(x.id),x]));
  const slots=(config.requiredBadgeIds||[]).map((id,i)=>{const x=earnedMap.get(String(id));return x?{slot:i+1,earned:true,id:String(id),name:x.name,icon:x.icon,tier:x.tier||'STANDARD'}:{slot:i+1,earned:false,name:'???',icon:'?',tier:'SECRET'};});
  const earned=slots.filter(x=>x.earned).length,total=slots.length,complete=Boolean(total&&earned===total);
  const start=Date.parse(config.startAt),end=Date.parse(config.endAt),now=Date.now();const active=config.enabled!==false&&now>=start&&now<=end;
  const claim=await getGiftClaim(config.id,userId);
  return {config:{enabled:config.enabled,id:config.id,title:config.title,subtitle:config.subtitle,startAt:config.startAt,endAt:config.endAt,giftName:config.giftName},slots,earned,total,complete,active,eligible:complete&&active,gift:claim};
}

async function claimGift(userId,input){
  const secret=await getSecretCollectionStatus(userId);if(!secret.eligible)throw new Error('현재 SECRET COLLECTION 선물 신청 조건을 모두 달성한 회원만 신청할 수 있습니다.');
  const config=await getSecretConfig();const existing=await getGiftClaim(config.id,userId);if(existing&&!['REJECTED'].includes(existing.status))throw new Error('이미 이번 시즌 선물 신청이 접수되어 있습니다.');
  if(input?.privacyConsent!==true)throw new Error('선물 배송을 위한 개인정보 수집·이용 동의가 필요합니다.');
  const recipient=cleanText(input?.recipient,40),phone=String(input?.phone||'').replace(/[^0-9]/g,'').slice(0,11),postalCode=cleanText(input?.postalCode,10),address1=cleanText(input?.address1,160),address2=cleanText(input?.address2,120);
  if(recipient.length<2)throw new Error('받는 분 이름을 입력해주세요.');if(!/^0\d{8,10}$/.test(phone))throw new Error('배송 연락처를 확인해주세요.');if(address1.length<5)throw new Error('배송 주소를 입력해주세요.');
  const claim={schemaVersion:1,seasonId:config.id,userId,status:'APPLIED',giftName:config.giftName,shippingEnc:encryptSensitive({recipient,phone,postalCode,address1,address2}),privacyConsentAt:nowIso(),appliedAt:nowIso(),updatedAt:nowIso(),courier:null,tracking:null,adminNote:null};
  await setJSON(giftKey(config.id,userId),claim);await Promise.all([cmd(['SADD',GIFT_SET,`${config.id}:${userId}`]),cmd(['SADD',giftUserSetKey(userId),giftKey(config.id,userId)])]);return getGiftClaim(config.id,userId);
}

async function adminSetReferralStatus(referredId,status,note=''){
  const rel=await getRelation(referredId);if(!rel)throw new Error('추천 관계를 찾을 수 없습니다.');const next=String(status||'').toUpperCase();if(!['PENDING','VALID','INVALID'].includes(next))throw new Error('추천 상태가 올바르지 않습니다.');
  rel.status=next;rel.adminOverride=next==='PENDING'?null:next;rel.adminNote=cleanText(note,240)||null;rel.updatedAt=nowIso();
  if(next==='VALID'){rel.validatedAt=rel.validatedAt||nowIso();rel.invalidatedAt=null;await cmd(['SADD',validSetKey(rel.referrerId),rel.referredId]);}
  else{await cmd(['SREM',validSetKey(rel.referrerId),rel.referredId]);if(next==='INVALID')rel.invalidatedAt=nowIso();}
  await setJSON(relationKey(rel.referredId),rel);await syncReferrerCounters(rel.referrerId);return rel;
}

async function adminReassignReferral(referredId,referrerNickname,note=''){
  const child=String(referredId||'');if(!child)throw new Error('추천받은 회원 ID가 없습니다.');const nextRef=await resolveReferrerNickname(referrerNickname);if(String(nextRef.id)===child)throw new Error('본인을 추천인으로 지정할 수 없습니다.');
  let rel=await getRelation(child);const oldRef=rel?.referrerId||null;if(rel&&oldRef){await cmd(['SREM',referredSetKey(oldRef),child]).catch(()=>{});await cmd(['SREM',validSetKey(oldRef),child]).catch(()=>{});}
  if(!rel)rel={schemaVersion:1,referredId:child,source:'ADMIN_CORRECTION',createdAt:nowIso()};
  rel.referrerId=String(nextRef.id);rel.referrerNicknameAtSignup=String(nextRef.nickname||referrerNickname);rel.status='PENDING';rel.validatedAt=null;rel.invalidatedAt=null;rel.adminOverride=null;rel.adminNote=cleanText(note,240)||'관리자 추천인 정정';rel.updatedAt=nowIso();
  await setJSON(relationKey(child),rel);await Promise.all([cmd(['SADD',RELATION_SET,child]),cmd(['SADD',referredSetKey(nextRef.id),child])]);if(oldRef)await syncReferrerCounters(oldRef);await syncReferrerCounters(nextRef.id);return rel;
}

async function adminRecalculateReferrals(){const ids=(await cmd(['SMEMBERS',RELATION_SET]).catch(()=>[]))||[];let valid=0,pending=0,invalid=0;for(const id of ids){let rel=await getRelation(id);if(!rel)continue;if(!rel.adminOverride)rel=await evaluateReferralForUser(id,{force:true})||rel;if(rel.status==='VALID')valid++;else if(rel.status==='INVALID')invalid++;else pending++;}return {total:ids.length,valid,pending,invalid}}

async function adminReferralOverview(){
  const ids=(await cmd(['SMEMBERS',RELATION_SET]).catch(()=>[]))||[];const rows=[];
  for(const id of ids.slice(0,1000)){const rel=await getRelation(id);if(!rel)continue;const [child,parent]=await Promise.all([getUserById(rel.referredId).catch(()=>null),getUserById(rel.referrerId).catch(()=>null)]);rows.push({...rel,referred:publicMember(child),referrer:publicMember(parent)});}
  rows.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  return rows;
}

async function adminGiftOverview(){
  const refs=(await cmd(['SMEMBERS',GIFT_SET]).catch(()=>[]))||[];const rows=[];
  for(const ref of refs.slice(0,1000)){const i=String(ref).indexOf(':');if(i<0)continue;const seasonId=String(ref).slice(0,i),userId=String(ref).slice(i+1);const [claim,u]=await Promise.all([getGiftClaim(seasonId,userId,{admin:true}),getUserById(userId).catch(()=>null)]);if(claim)rows.push({...claim,user:publicMember(u)});}
  rows.sort((a,b)=>String(b.appliedAt||'').localeCompare(String(a.appliedAt||'')));return rows;
}

async function adminSetGiftStatus({seasonId,userId,status,courier,tracking,note}){
  const key=giftKey(seasonId,userId),claim=await getJSON(key).catch(()=>null);if(!claim)throw new Error('선물 신청 내역을 찾을 수 없습니다.');const next=String(status||'').toUpperCase();if(!GIFT_STATUSES.includes(next))throw new Error('배송 상태가 올바르지 않습니다.');claim.status=next;claim.courier=cleanText(courier,40)||null;claim.tracking=cleanText(tracking,80)||null;claim.adminNote=cleanText(note,240)||null;claim.updatedAt=nowIso();if(next==='SHIPPED'&&!claim.shippedAt)claim.shippedAt=nowIso();if(next==='DELIVERED'&&!claim.deliveredAt)claim.deliveredAt=nowIso();await setJSON(key,claim);return getGiftClaim(seasonId,userId,{admin:true});
}

async function getDashboard(userId){
  await evaluateReferralForUser(userId).catch(()=>{});
  const [referral,secret,ownRelation,user]=await Promise.all([getReferralSummary(userId),getSecretCollectionStatus(userId),getRelation(userId),getUserById(userId)]);
  let invitedBy=null;if(ownRelation){const parent=await getUserById(ownRelation.referrerId).catch(()=>null);invitedBy=parent?{nickname:parent.nickname,status:ownRelation.status}:null;}
  return {ok:true,nickname:user?.nickname||null,referral,invitedBy,secret};
}

async function clearReferralData(userId){
  const id=String(userId||'');if(!id)return;
  const own=await getRelation(id);
  if(own){await cmd(['SREM',validSetKey(own.referrerId),id]).catch(()=>{});await cmd(['SREM',referredSetKey(own.referrerId),id]).catch(()=>{});await syncReferrerCounters(own.referrerId).catch(()=>{});own.status='INVALID';own.adminOverride='INVALID';own.adminNote='회원 탈퇴';own.invalidatedAt=nowIso();own.updatedAt=nowIso();await setJSON(relationKey(id),own).catch(()=>{});}
  const children=(await cmd(['SMEMBERS',referredSetKey(id)]).catch(()=>[]))||[];
  for(const child of children){const rel=await getRelation(child);if(rel){rel.status='INVALID';rel.adminOverride='INVALID';rel.adminNote='추천인 회원 탈퇴';rel.invalidatedAt=nowIso();rel.updatedAt=nowIso();await setJSON(relationKey(child),rel).catch(()=>{});}}
  await Promise.all([cmd(['DEL',referredSetKey(id)]).catch(()=>{}),cmd(['DEL',validSetKey(id)]).catch(()=>{})]);
  const giftKeys=(await cmd(['SMEMBERS',giftUserSetKey(id)]).catch(()=>[]))||[];for(const k of giftKeys)await cmd(['DEL',k]).catch(()=>{});await cmd(['DEL',giftUserSetKey(id)]).catch(()=>{});
}

module.exports={VALID_AGE_MS,VALID_ACTIVE_DAYS,GIFT_STATUSES,resolveReferrerNickname,createReferral,getRelation,evaluateReferralForUser,getReferralSummary,getSecretConfig,saveSecretConfig,getSecretCollectionStatus,claimGift,getGiftClaim,getDashboard,adminSetReferralStatus,adminReassignReferral,adminRecalculateReferrals,adminReferralOverview,adminGiftOverview,adminSetGiftStatus,clearReferralData,syncReferrerCounters};
