const {encryptSensitive,decryptSensitive}=require('./user_auth');
const MAX_POLITICIANS=30;
const MAX_ISSUES=30;

function plusState(user){
  const src=decryptSensitive(user?.plusDataEnc)||user?.plusData||{};
  const politicianIds=[...new Set((Array.isArray(src.politicianIds)?src.politicianIds:[]).map(Number).filter(Number.isFinite))].slice(0,MAX_POLITICIANS);
  const issues=[...new Set((Array.isArray(src.issues)?src.issues:[]).map(v=>normalizeIssue(v)).filter(Boolean))].slice(0,MAX_ISSUES);
  return {politicianIds,issues,updatedAt:src.updatedAt||null};
}
function normalizeIssue(v){
  return String(v||'').trim().replace(/^#+/,'').replace(/\s+/g,' ').slice(0,60);
}
function mutatePlusState(user,action,payload={}){
  const state=plusState(user);
  const act=String(action||'');
  if(act==='addPolitician'){
    const id=Number(payload.memberId);
    if(!Number.isFinite(id)) throw new Error('올바른 의원 ID가 아닙니다.');
    if(!state.politicianIds.includes(id)) state.politicianIds.unshift(id);
    state.politicianIds=state.politicianIds.slice(0,MAX_POLITICIANS);
  }else if(act==='removePolitician'){
    const id=Number(payload.memberId);
    state.politicianIds=state.politicianIds.filter(v=>v!==id);
  }else if(act==='addIssue'){
    const issue=normalizeIssue(payload.issue);
    if(issue.length<2) throw new Error('관심 이슈는 2자 이상 입력해주세요.');
    state.issues=[issue,...state.issues.filter(v=>v.toLowerCase()!==issue.toLowerCase())].slice(0,MAX_ISSUES);
  }else if(act==='removeIssue'){
    const issue=normalizeIssue(payload.issue).toLowerCase();
    state.issues=state.issues.filter(v=>v.toLowerCase()!==issue);
  }else if(act==='clear'){
    state.politicianIds=[];state.issues=[];
  }else{
    throw new Error('지원하지 않는 PLUS 저장 요청입니다.');
  }
  state.updatedAt=new Date().toISOString();
  user.plusDataEnc=encryptSensitive(state);
  if(Object.prototype.hasOwnProperty.call(user,'plusData')) delete user.plusData;
  return state;
}
module.exports={MAX_POLITICIANS,MAX_ISSUES,plusState,normalizeIssue,mutatePlusState};
