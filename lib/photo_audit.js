const {activeRoster}=require('./political_roster');
const {resolvePersonPhoto,invalidatePersonPhoto,probePhotoRecord}=require('./local_photo');

const MIN_SIDE=500;
function entityLabel(m){return m.entityType==='assembly'?'국회의원':m.entityType==='metro'?'광역단체장':'기초단체장';}
function issueOf(photo,probe){
  if(!photo?.url)return '사진 없음';
  if(!probe?.ok)return probe?.error==='TIMEOUT'?'이미지 응답 시간초과':'이미지 URL 오류';
  if(!photo?.verified)return '인물 문맥 검증 필요';
  if(Number(probe.width||0)<MIN_SIDE||Number(probe.height||0)<MIN_SIDE)return `저해상도 ${probe.width||'?'}×${probe.height||'?'}`;
  return null;
}
function scoreProbe(photo,probe){
  if(!photo?.url||!probe?.ok)return -10000;
  const w=Number(probe.width||0),h=Number(probe.height||0);
  let score=Math.min(200,(w*h)/10000);
  if(w>=MIN_SIDE&&h>=MIN_SIDE)score+=300;
  if(photo.verified)score+=120;
  if(photo.official)score+=80;
  if(photo.manual)score+=60;
  return score;
}
async function auditMember(member){
  const started=Date.now();
  let initial=null,initialProbe={ok:false,width:0,height:0,error:'NO_URL'};
  try{initial=await resolvePersonPhoto(member.id);if(initial?.url)initialProbe=await probePhotoRecord(initial);}catch(_){}
  const initialIssue=issueOf(initial,initialProbe);
  let chosen=initial,chosenProbe=initialProbe,status='OK',action='유지',issue=initialIssue;
  if(initialIssue){
    try{
      await invalidatePersonPhoto(member.id);
      const replacement=await resolvePersonPhoto(member.id,{force:true});
      const replacementProbe=replacement?.url?await probePhotoRecord(replacement):{ok:false,width:0,height:0,error:'NO_URL'};
      if(scoreProbe(replacement,replacementProbe)>scoreProbe(initial,initialProbe)){
        chosen=replacement;chosenProbe=replacementProbe;action='재검색 후 교체';
      }else{
        chosen=initial||replacement;chosenProbe=initial?.url?initialProbe:replacementProbe;action='재검색했으나 기존/최선 유지';
      }
      issue=issueOf(chosen,chosenProbe);
      if(!issue&&chosen?.url)status='IMPROVED';
      else if(chosenProbe?.ok)status='REVIEW';
      else status='FAILED';
    }catch(_){status=initialProbe?.ok?'REVIEW':'FAILED';action='재검색 실패';}
  }
  if(!initialIssue)status='OK';
  if(status==='OK'&&chosen?.source&&/bing-image|kakao-image/i.test(chosen.source)&&!chosen.profileUrl){status='REVIEW';issue='원문 페이지 확인 필요';}
  return {
    id:member.id,name:member.name,party:member.party,entityType:member.entityType,entityLabel:entityLabel(member),
    office:member.office,jurisdiction:member.jurisdiction||member.constituency||member.region||'',
    status,action,issue:issue||null,url:chosen?.url||null,profileUrl:chosen?.profileUrl||null,source:chosen?.source||null,
    verified:Boolean(chosen?.verified),official:Boolean(chosen?.official),manual:Boolean(chosen?.manual),
    width:Number(chosenProbe?.width||chosen?.width||0),height:Number(chosenProbe?.height||chosen?.height||0),httpStatus:chosenProbe?.httpStatus||null,
    initialIssue:initialIssue||null,checkedAt:new Date().toISOString(),elapsedMs:Date.now()-started
  };
}
function summarize(results,total=activeRoster().length){
  const s={total,processed:results.length,ok:0,improved:0,review:0,failed:0};
  for(const r of results){if(r.status==='OK')s.ok++;else if(r.status==='IMPROVED')s.improved++;else if(r.status==='REVIEW')s.review++;else if(r.status==='FAILED')s.failed++;}
  return s;
}
module.exports={MIN_SIDE,auditMember,summarize};
