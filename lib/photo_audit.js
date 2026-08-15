const {photoRoster}=require('./political_roster');
const {resolvePersonPhoto,clearPersonPhotoOverride,cachePersonPhotoRecord,probePhotoRecord,assemblyOfficialPhoto}=require('./local_photo');

const MIN_SIDE=500;
function entityLabel(m){return m.entityType==='assembly'?'국회의원':m.entityType==='metro'?'광역단체장':m.entityType==='local'?'기초단체장':m.entityType==='government'?'정부 주요인사':'인물';}
function issueOf(photo,probe){
  if(!photo?.url)return {code:'NO_PHOTO',message:'사진 없음'};
  if(!probe?.ok){
    const e=String(probe?.error||'');
    if(e==='TIMEOUT')return {code:'TIMEOUT',message:'이미지 응답 시간초과'};
    if(/^HTTP_/.test(e))return {code:e,message:`이미지 URL 오류 (${e.replace('HTTP_','HTTP ')})`};
    return {code:e||'FETCH_FAILED',message:'이미지 URL 오류'};
  }
  if(!photo?.verified)return {code:'CONTEXT',message:'인물 문맥 검증 필요'};
  if(Number(probe.width||0)<MIN_SIDE||Number(probe.height||0)<MIN_SIDE)return {code:'LOW_RES',message:`저해상도 ${probe.width||'?'}×${probe.height||'?'}`};
  if(photo?.source&&/bing-image|kakao-image/i.test(photo.source)&&!photo.profileUrl)return {code:'SOURCE_CONTEXT',message:'원문 페이지 확인 필요'};
  return null;
}
function scoreProbe(photo,probe){
  if(!photo?.url||!probe?.ok)return -10000;
  const w=Number(probe.width||0),h=Number(probe.height||0);
  let score=Math.min(200,(w*h)/10000);
  if(w>=MIN_SIDE&&h>=MIN_SIDE)score+=300;
  if(photo.verified)score+=120;
  if(photo.official)score+=80;
  if(photo.manual)score+=70;
  if(photo.profileUrl)score+=20;
  return score;
}
async function stableProbe(photo,{deep=false}={}){
  if(!photo?.url)return {ok:false,width:0,height:0,error:'NO_URL'};
  const attempts=deep?3:2;
  let last=null;
  for(let i=0;i<attempts;i++){
    last=await probePhotoRecord(photo,deep?8500:6500).catch(()=>({ok:false,width:0,height:0,error:'FETCH_FAILED'}));
    if(last?.ok)return last;
    if(i<attempts-1)await new Promise(r=>setTimeout(r,180+(i*220)));
  }
  return last||{ok:false,width:0,height:0,error:'FETCH_FAILED'};
}
async function inspectMember(member){
  let photo=null,probe={ok:false,width:0,height:0,error:'NO_URL'};
  try{photo=await resolvePersonPhoto(member.id);if(photo?.url)probe=await stableProbe(photo);}catch(_){}
  const issue=issueOf(photo,probe);
  return {photo,probe,issue,score:scoreProbe(photo,probe)};
}
function resultFrom(member,chosen,{status='OK',action='유지',initialIssue=null,started=Date.now(),repairAttempts=0}={}){
  const photo=chosen?.photo||null,probe=chosen?.probe||{ok:false},issue=issueOf(photo,probe);
  return {
    id:member.id,name:member.name,party:member.party,entityType:member.entityType,entityLabel:entityLabel(member),
    office:member.office,jurisdiction:member.jurisdiction||member.constituency||member.region||'',
    status,action,issue:issue?.message||null,issueCode:issue?.code||null,url:photo?.url||null,profileUrl:photo?.profileUrl||null,source:photo?.source||null,
    verified:Boolean(photo?.verified),official:Boolean(photo?.official),manual:Boolean(photo?.manual),
    width:Number(probe?.width||photo?.width||0),height:Number(probe?.height||photo?.height||0),httpStatus:probe?.httpStatus||null,
    initialIssue:initialIssue?.message||initialIssue||null,initialIssueCode:initialIssue?.code||null,repairAttempts,
    repairable:status==='REVIEW'||status==='FAILED',checkedAt:new Date().toISOString(),elapsedMs:Date.now()-started
  };
}
async function forcedCandidate(member,{deep=false,ignoreOverride=false}={}){
  try{
    // v2.2.23: 절대 먼저 invalidate 하지 않습니다. 후보가 실제로 살아 있는지 검증한 다음에만 교체합니다.
    // 국회의원은 웹 이미지 검색으로 추정 교체하지 않고 오직 국회 공식사진만 후보로 허용합니다.
    const photo=member.entityType==='assembly'
      ? await assemblyOfficialPhoto(member).catch(()=>null)
      : await resolvePersonPhoto(member.id,{force:true,ignoreOverride,searchMode:deep?'repair':'normal',persist:false});
    const probe=photo?.url?await stableProbe(photo,{deep}):{ok:false,width:0,height:0,error:'NO_URL'};
    return {photo,probe,issue:issueOf(photo,probe),score:scoreProbe(photo,probe)};
  }catch(_){return {photo:null,probe:{ok:false,width:0,height:0,error:'SEARCH_FAILED'},issue:{code:'SEARCH_FAILED',message:'재검색 실패'},score:-10000};}
}
async function commitCandidate(member,candidate,initial){
  if(!candidate?.photo?.url||!candidate?.probe?.ok)return false;
  if(initial?.photo?.manual && candidate.photo.url!==initial.photo.url)await clearPersonPhotoOverride(member.id).catch(()=>{});
  return await cachePersonPhotoRecord(member.id,candidate.photo).catch(()=>false);
}
async function auditMember(member){
  const started=Date.now(),initial=await inspectMember(member),initialIssue=initial.issue;
  if(!initialIssue)return resultFrom(member,initial,{status:'OK',action:'유지',started});
  const replacement=await forcedCandidate(member,{deep:false,ignoreOverride:Boolean(initial.photo?.manual)});
  let chosen=initial,action='기존 사진 보존 · 새 후보 미확정';
  if(replacement.probe?.ok && replacement.score>initial.score){
    chosen=replacement;action='검증된 새 후보로 교체';await commitCandidate(member,replacement,initial);
  }
  const issue=issueOf(chosen.photo,chosen.probe);
  const status=!issue&&chosen.photo?.url?(chosen===replacement?'IMPROVED':'OK'):chosen.probe?.ok?'REVIEW':'FAILED';
  return resultFrom(member,chosen,{status,action,initialIssue,started,repairAttempts:1});
}
async function repairMember(member){
  const started=Date.now(),initial=await inspectMember(member),initialIssue=initial.issue;
  if(!initialIssue)return resultFrom(member,initial,{status:'OK',action:'이미 정상 · 복구 불필요',started});
  let best=initial,attempts=0;
  for(let i=0;i<2;i++){
    attempts++;
    const candidate=await forcedCandidate(member,{deep:true,ignoreOverride:Boolean(initial.photo?.manual)});
    if(candidate.probe?.ok&&candidate.score>best.score)best=candidate;
    if(!issueOf(best.photo,best.probe))break;
    if(i===0)await new Promise(r=>setTimeout(r,350));
  }
  const improved=best!==initial&&best.probe?.ok&&best.score>initial.score;
  if(improved)await commitCandidate(member,best,initial);
  const issue=issueOf(best.photo,best.probe);
  const status=!issue&&best.photo?.url?(improved?'IMPROVED':'OK'):best.probe?.ok?'REVIEW':'FAILED';
  const action=!issue?(improved?'자동 복구 성공':'복구 후 정상 확인'):(improved?'더 나은 후보 확보 · 추가 검토 필요':'기존 사진/캐시 보존 · 자동 복구 후보 없음');
  return resultFrom(member,best,{status,action,initialIssue,started,repairAttempts:attempts});
}
async function recheckMember(member){
  const started=Date.now(),x=await inspectMember(member),issue=x.issue;
  const status=!issue?'OK':x.probe?.ok?'REVIEW':'FAILED';
  return resultFrom(member,x,{status,action:!issue?(x.photo?.manual?'직접 등록 사진 정상':'재확인 정상'):'재확인 필요 · 기존 캐시 보존',started});
}
function summarize(results,total=photoRoster().length){
  const s={total,processed:results.length,ok:0,improved:0,review:0,failed:0};
  for(const r of results){if(r.status==='OK')s.ok++;else if(r.status==='IMPROVED')s.improved++;else if(r.status==='REVIEW')s.review++;else if(r.status==='FAILED')s.failed++;}
  return s;
}
module.exports={MIN_SIDE,auditMember,repairMember,recheckMember,summarize,issueOf,scoreProbe,stableProbe};
