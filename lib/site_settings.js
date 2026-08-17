const crypto=require('crypto');
const {cmd,getJSON,setJSON}=require('./store');

const NOW_ISSUE_KEY='jjdd:site:now-issue:v1';
const SURVEY_KEY='jjdd:site:survey:v1';
const SURVEY_VOTES_PREFIX='jjdd:site:survey:votes:v1:';
const SURVEY_COUNTS_PREFIX='jjdd:site:survey:counts:v1:';
const SURVEY_INVALID_PREFIX='jjdd:site:survey:invalid:v1:';
const SURVEY_ADJUST_PREFIX='jjdd:site:survey:adjust:v1:';
const SURVEY_AUDIT_PREFIX='jjdd:site:survey:audit:v1:';
const RAPID_RISE_KEY='jjdd:site:rapid-rise:v1';

const DEFAULT_NOW_ISSUE={
  enabled:true,
  title:'정치권 핵심 현안',
  subtitle:'지금 주목해야 할 정치 이슈',
  content:'NOW ISSUE는 특정 선거나 이벤트 형식에 묶이지 않고, 운영자가 지금 가장 중요한 이슈를 자유롭게 설명할 수 있습니다.',
  updatedAt:null,
  updatedBy:null,
  schemaVersion:3
};
const DEFAULT_RAPID_RISE={
  enabled:true,
  mode:'auto',
  slots:Array.from({length:10},()=>null),
  updatedAt:null,
  updatedBy:null,
  schemaVersion:1
};
const DEFAULT_SURVEY={
  id:'survey_default_v1',
  fingerprint:'',
  active:true,
  title:'지금 가장 관심 있게 지켜보는 정치 이슈는 무엇인가요?',
  subtitle:'정참시 회원 여러분의 의견을 들려주세요.',
  options:['민생·경제','정당·선거','외교·안보','지역 현안'],
  createdAt:null,
  updatedAt:null,
  updatedBy:null,
  schemaVersion:1
};
function clean(v,max=160){return String(v??'').replace(/\u0000/g,'').trim().slice(0,max);}
function cleanRows(rows){
  return (Array.isArray(rows)?rows:[]).slice(0,5).map(r=>({label:clean(r?.label,40),value:clean(r?.value,30)})).filter(r=>r.label&&r.value);
}
function cleanOptions(options){return (Array.isArray(options)?options:[]).slice(0,5).map(x=>clean(x,60)).filter(Boolean);}
function fingerprintSurvey(title,subtitle,options){return crypto.createHash('sha256').update(JSON.stringify([title,subtitle,options])).digest('hex').slice(0,24);}
async function getNowIssue(){
  const stored=(await getJSON(NOW_ISSUE_KEY).catch(()=>null))||null;
  if(!stored)return {...DEFAULT_NOW_ISSUE};
  const version=Number(stored.schemaVersion||1);
  if(version<3){
    // v2.6.1: 전당대회/여론조사 전용 스키마를 범용 대제목·소제목·내용 구조로 1회 마이그레이션.
    const migrated={
      enabled:stored.enabled!==false,
      title:clean(stored.title||stored.label||stored.headline||DEFAULT_NOW_ISSUE.title,100),
      subtitle:clean(stored.subtitle||stored.headline||DEFAULT_NOW_ISSUE.subtitle,160),
      content:clean(stored.content||stored.summary||DEFAULT_NOW_ISSUE.content,1200),
      updatedAt:stored.updatedAt||null,
      updatedBy:stored.updatedBy||null,
      migratedAt:new Date().toISOString(),
      schemaVersion:3
    };
    await setJSON(NOW_ISSUE_KEY,migrated).catch(()=>{});
    return migrated;
  }
  return {...DEFAULT_NOW_ISSUE,...stored};
}
async function saveNowIssue(input,admin){
  const current=await getNowIssue();
  const next={
    ...current,
    enabled:input.enabled!==false,
    title:clean(input.title,100),
    subtitle:clean(input.subtitle,160),
    content:clean(input.content,1200),
    updatedAt:new Date().toISOString(),updatedBy:String(admin?.id||'admin'),schemaVersion:3
  };
  if(!next.title)throw new Error('NOW ISSUE 대제목을 입력해주세요.');
  await setJSON(NOW_ISSUE_KEY,next);return next;
}

function cleanRapidSlots(slots){
  const used=new Set();
  return Array.from({length:10},(_,i)=>{
    const raw=Array.isArray(slots)?slots[i]:null;
    if(raw==null)return null;
    const id=Number(typeof raw==='object'?raw.id:raw);
    if(!Number.isInteger(id)||id<=0||used.has(id))return null;
    used.add(id);
    const changeRaw=typeof raw==='object'?raw.change:null;
    const change=(changeRaw===''||changeRaw==null)?null:Number(changeRaw);
    return {id,change:Number.isFinite(change)?Math.max(0,Math.min(999,Math.round(change))):null};
  });
}
async function getRapidRise(){
  const stored=await getJSON(RAPID_RISE_KEY).catch(()=>null);
  return {...DEFAULT_RAPID_RISE,...(stored||{}),slots:cleanRapidSlots(stored?.slots||DEFAULT_RAPID_RISE.slots)};
}
async function saveRapidRise(input,admin){
  const current=await getRapidRise();
  const mode=String(input?.mode||current.mode||'auto')==='manual'?'manual':'auto';
  const next={...current,enabled:input?.enabled!==false,mode,slots:cleanRapidSlots(input?.slots),updatedAt:new Date().toISOString(),updatedBy:String(admin?.id||'admin'),schemaVersion:1};
  await setJSON(RAPID_RISE_KEY,next);return next;
}

async function getSurvey(){
  const stored=await getJSON(SURVEY_KEY).catch(()=>null);
  const base={...DEFAULT_SURVEY,...(stored||{})};
  if(!base.fingerprint)base.fingerprint=fingerprintSurvey(base.title,base.subtitle,base.options);
  return base;
}
async function saveSurvey(input,admin){
  const current=await getSurvey();
  const title=clean(input.title,80),subtitle=clean(input.subtitle,180),options=cleanOptions(input.options);
  if(title.length<2)throw new Error('설문 제목을 2자 이상 입력해주세요.');
  if(options.length<1||options.length>5)throw new Error('설문 문항은 1개 이상 5개 이하로 입력해주세요.');
  const fp=fingerprintSurvey(title,subtitle,options);
  const changed=fp!==current.fingerprint;
  const now=new Date().toISOString();
  const next={
    id:changed?`survey_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`:current.id,
    fingerprint:fp,
    active:input.active!==false,title,subtitle,options,
    createdAt:changed?now:(current.createdAt||now),updatedAt:now,updatedBy:String(admin?.id||'admin'),schemaVersion:1
  };
  await setJSON(SURVEY_KEY,next);return {...next,responsesReset:changed};
}
function parseHash(v){
  if(!v)return{};if(!Array.isArray(v)&&typeof v==='object')return v;
  const out={};for(let i=0;i<(v||[]).length;i+=2)out[String(v[i])]=v[i+1];return out;
}
async function surveyAudit(survey,entry){
  const id=String(survey?.id||'');if(!id)return;
  const row={at:new Date().toISOString(),...entry};
  await cmd(['LPUSH',SURVEY_AUDIT_PREFIX+id,JSON.stringify(row)]).catch(()=>{});
  await cmd(['LTRIM',SURVEY_AUDIT_PREFIX+id,'0','99']).catch(()=>{});
}
async function recountSurvey(survey){
  const id=String(survey?.id||'');if(!id)return {counts:[],total:0};
  const rawVotes=await cmd(['HGETALL',SURVEY_VOTES_PREFIX+id]).catch(()=>null),votes=parseHash(rawVotes);
  const counts=(survey.options||[]).map(()=>0);
  for(const raw of Object.values(votes)){
    const idx=Number(raw);if(Number.isInteger(idx)&&idx>=0&&idx<counts.length)counts[idx]++;
  }
  const key=SURVEY_COUNTS_PREFIX+id;await cmd(['DEL',key]).catch(()=>{});
  const pairs=[];counts.forEach((v,i)=>{if(v>0)pairs.push(String(i),String(v));});
  if(pairs.length)await cmd(['HSET',key,...pairs]);
  return {counts,total:counts.reduce((a,b)=>a+b,0)};
}
async function surveyStats(survey,userId){
  const id=String(survey?.id||'');
  if(!id)return {counts:[],realCounts:[],adjustments:[],total:0,realTotal:0,userVote:null,adminAdjusted:false};
  const [rawCounts,userVoteRaw,rawAdjust]=await Promise.all([
    cmd(['HGETALL',SURVEY_COUNTS_PREFIX+id]).catch(()=>null),
    userId?cmd(['HGET',SURVEY_VOTES_PREFIX+id,String(userId)]).catch(()=>null):Promise.resolve(null),
    cmd(['HGETALL',SURVEY_ADJUST_PREFIX+id]).catch(()=>null)
  ]);
  const map=parseHash(rawCounts),adjMap=parseHash(rawAdjust),realCounts=(survey.options||[]).map((_,i)=>Math.max(0,Number(map[String(i)]||0)));
  const adjustments=(survey.options||[]).map((_,i)=>{const n=Number(adjMap[String(i)]||0);return Number.isFinite(n)?Math.max(-1000000,Math.min(1000000,Math.round(n))):0;});
  const counts=realCounts.map((v,i)=>Math.max(0,v+adjustments[i]));
  const realTotal=realCounts.reduce((a,b)=>a+b,0),total=counts.reduce((a,b)=>a+b,0);
  const uv=userVoteRaw==null?null:Number(userVoteRaw);
  return {counts,realCounts,adjustments,total,realTotal,userVote:Number.isInteger(uv)?uv:null,adminAdjusted:adjustments.some(Boolean),adjustmentNet:total-realTotal};
}
async function voteSurvey(survey,userId,optionIndex){
  if(!survey?.active)throw new Error('현재 진행 중인 설문이 아닙니다.');
  const idx=Number(optionIndex);if(!Number.isInteger(idx)||idx<0||idx>=survey.options.length)throw new Error('설문 문항을 선택해주세요.');
  const votesKey=SURVEY_VOTES_PREFIX+survey.id,countsKey=SURVEY_COUNTS_PREFIX+survey.id;
  const reserved=Number(await cmd(['HSETNX',votesKey,String(userId),String(idx)]));
  if(reserved!==1)throw new Error('이미 참여한 설문입니다.');
  try{await cmd(['HINCRBY',countsKey,String(idx),'1']);}
  catch(e){await cmd(['HDEL',votesKey,String(userId)]).catch(()=>{});throw e;}
  return surveyStats(survey,userId);
}
async function surveyModeration(survey,limit=300){
  const id=String(survey?.id||'');if(!id)return {active:[],invalid:[],audit:[],truncated:false};
  const [rawVotes,rawInvalid,auditRaw]=await Promise.all([
    cmd(['HGETALL',SURVEY_VOTES_PREFIX+id]).catch(()=>null),
    cmd(['HGETALL',SURVEY_INVALID_PREFIX+id]).catch(()=>null),
    cmd(['LRANGE',SURVEY_AUDIT_PREFIX+id,'0','99']).catch(()=>[])
  ]);
  const votes=parseHash(rawVotes),invalid=parseHash(rawInvalid),max=Math.max(10,Math.min(1000,Number(limit)||300));
  const active=Object.entries(votes).slice(0,max).map(([userId,optionIndex])=>({userId,optionIndex:Number(optionIndex),state:'ACTIVE'}));
  const invalidRows=Object.entries(invalid).slice(0,max).map(([userId,value])=>{try{return {userId,...JSON.parse(String(value)),state:'INVALID'};}catch(_){return {userId,optionIndex:null,reason:String(value||''),state:'INVALID'};}});
  const audit=(Array.isArray(auditRaw)?auditRaw:[]).map(v=>{try{return JSON.parse(String(v));}catch(_){return {raw:String(v)};}});
  return {active,invalid:invalidRows,audit,truncated:Object.keys(votes).length>max||Object.keys(invalid).length>max,activeTotal:Object.keys(votes).length,invalidTotal:Object.keys(invalid).length};
}
async function invalidateSurveyVote(survey,userId,reason,admin){
  const uid=String(userId||'').trim(),why=clean(reason,240);if(!uid)throw new Error('회원 ID가 필요합니다.');if(!why)throw new Error('무효화 사유를 입력해주세요.');
  const votesKey=SURVEY_VOTES_PREFIX+survey.id,invalidKey=SURVEY_INVALID_PREFIX+survey.id;
  const raw=await cmd(['HGET',votesKey,uid]);if(raw==null)throw new Error('현재 유효 응답에서 찾을 수 없습니다.');
  const row={optionIndex:Number(raw),reason:why,invalidAt:new Date().toISOString(),invalidBy:String(admin?.id||'admin')};
  await cmd(['HSET',invalidKey,uid,JSON.stringify(row)]);await cmd(['HDEL',votesKey,uid]);await recountSurvey(survey);
  await surveyAudit(survey,{action:'invalidate-vote',userId:uid,optionIndex:row.optionIndex,reason:why,by:row.invalidBy});return surveyStats(survey,null);
}
async function restoreSurveyVote(survey,userId,admin){
  const uid=String(userId||'').trim(),votesKey=SURVEY_VOTES_PREFIX+survey.id,invalidKey=SURVEY_INVALID_PREFIX+survey.id;
  if(await cmd(['HGET',votesKey,uid])!=null)throw new Error('이미 유효 응답으로 존재합니다.');
  const raw=await cmd(['HGET',invalidKey,uid]);if(raw==null)throw new Error('무효 응답에서 찾을 수 없습니다.');
  let row;try{row=JSON.parse(String(raw));}catch(_){row={optionIndex:Number(raw)};}
  const idx=Number(row.optionIndex);if(!Number.isInteger(idx)||idx<0||idx>=survey.options.length)throw new Error('복구할 문항 정보가 올바르지 않습니다.');
  await cmd(['HSET',votesKey,uid,String(idx)]);await cmd(['HDEL',invalidKey,uid]);await recountSurvey(survey);
  await surveyAudit(survey,{action:'restore-vote',userId:uid,optionIndex:idx,by:String(admin?.id||'admin')});return surveyStats(survey,null);
}
async function invalidateSurveyOption(survey,optionIndex,reason,admin){
  const idx=Number(optionIndex),why=clean(reason,240);if(!Number.isInteger(idx)||idx<0||idx>=survey.options.length)throw new Error('대상 문항을 선택해주세요.');if(!why)throw new Error('일괄 무효화 사유를 입력해주세요.');
  const votesKey=SURVEY_VOTES_PREFIX+survey.id,invalidKey=SURVEY_INVALID_PREFIX+survey.id,raw=parseHash(await cmd(['HGETALL',votesKey]).catch(()=>null));let changed=0;
  for(const [uid,v] of Object.entries(raw))if(Number(v)===idx){const row={optionIndex:idx,reason:why,invalidAt:new Date().toISOString(),invalidBy:String(admin?.id||'admin'),bulk:true};await cmd(['HSET',invalidKey,uid,JSON.stringify(row)]);await cmd(['HDEL',votesKey,uid]);changed++;}
  await recountSurvey(survey);await surveyAudit(survey,{action:'invalidate-option',optionIndex:idx,count:changed,reason:why,by:String(admin?.id||'admin')});return {changed,stats:await surveyStats(survey,null)};
}
async function setSurveyAdjustment(survey,optionIndex,delta,reason,admin){
  const idx=Number(optionIndex),n=Number(delta),why=clean(reason,240)||'관리자 직접 보정';if(!Number.isInteger(idx)||idx<0||idx>=survey.options.length)throw new Error('대상 문항을 선택해주세요.');if(!Number.isFinite(n)||Math.abs(n)>1000000)throw new Error('보정값은 -1,000,000~1,000,000 범위의 숫자로 입력해주세요.');
  const d=Math.round(n),key=SURVEY_ADJUST_PREFIX+survey.id;if(d===0)await cmd(['HDEL',key,String(idx)]);else await cmd(['HSET',key,String(idx),String(d)]);
  const stats=await surveyStats(survey,null);
  if(Number(stats.adjustments?.[idx]||0)!==d)throw new Error('보정값 저장 확인에 실패했습니다. 다시 시도해주세요.');
  await surveyAudit(survey,{action:'set-adjustment',optionIndex:idx,delta:d,reason:d===0?(clean(reason,240)||'보정 제거'):why,by:String(admin?.id||'admin'),resultCount:Number(stats.counts?.[idx]||0),realCount:Number(stats.realCounts?.[idx]||0)});return stats;
}
async function clearSurveyAdjustments(survey,admin){await cmd(['DEL',SURVEY_ADJUST_PREFIX+survey.id]).catch(()=>{});await surveyAudit(survey,{action:'clear-adjustments',by:String(admin?.id||'admin')});return surveyStats(survey,null);}
async function resetSurveyResponses(survey,reason,admin){
  const why=clean(reason,240);if(!why)throw new Error('전체 초기화 사유를 입력해주세요.');
  const before=await surveyStats(survey,null);await Promise.all([cmd(['DEL',SURVEY_VOTES_PREFIX+survey.id]),cmd(['DEL',SURVEY_COUNTS_PREFIX+survey.id]),cmd(['DEL',SURVEY_INVALID_PREFIX+survey.id]),cmd(['DEL',SURVEY_ADJUST_PREFIX+survey.id])].map(p=>Promise.resolve(p).catch(()=>{})));
  await surveyAudit(survey,{action:'reset-responses',beforeRealTotal:before.realTotal,beforeDisplayTotal:before.total,reason:why,by:String(admin?.id||'admin')});return surveyStats(survey,null);
}
module.exports={DEFAULT_NOW_ISSUE,DEFAULT_RAPID_RISE,DEFAULT_SURVEY,getNowIssue,saveNowIssue,getRapidRise,saveRapidRise,getSurvey,saveSurvey,surveyStats,voteSurvey,surveyModeration,recountSurvey,invalidateSurveyVote,restoreSurveyVote,invalidateSurveyOption,setSurveyAdjustment,clearSurveyAdjustments,resetSurveyResponses};
