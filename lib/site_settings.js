const crypto=require('crypto');
const {cmd,getJSON,setJSON}=require('./store');

const NOW_ISSUE_KEY='jjdd:site:now-issue:v1';
const SURVEY_KEY='jjdd:site:survey:v1';
const SURVEY_VOTES_PREFIX='jjdd:site:survey:votes:v1:';
const SURVEY_COUNTS_PREFIX='jjdd:site:survey:counts:v1:';

const DEFAULT_NOW_ISSUE={
  enabled:true,
  label:'민주당 8·17 전당대회',
  headline:'당대표 본선 3파전 · 8월 17일 대전',
  summary:'김민석·정청래·송영길 후보가 본경선에 진출했습니다. 민주당은 예비경선 후보별 득표율을 공개하지 않았습니다.',
  dataTitle:'NBS 당대표 적합도 · 7.27~29 전체 응답',
  rows:[
    {label:'정청래',value:'21%'},
    {label:'김민석',value:'19%'},
    {label:'송영길',value:'6%'}
  ],
  footer:'민주당 지지층: 정청래 34% · 김민석 29% · 송영길 9%',
  source:'NBS 2026.07.27~29 · 표본 1,000명 · 95% 신뢰수준 ±3.1%p',
  note:'※ 여론조사 적합도이며 경선 득표율이 아닙니다.',
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
async function getNowIssue(){return {...DEFAULT_NOW_ISSUE,...((await getJSON(NOW_ISSUE_KEY).catch(()=>null))||{})};}
async function saveNowIssue(input,admin){
  const current=await getNowIssue();
  const rows=cleanRows(input.rows);
  const next={
    ...current,
    enabled:input.enabled!==false,
    label:clean(input.label,50),
    headline:clean(input.headline,120),
    summary:clean(input.summary,500),
    dataTitle:clean(input.dataTitle,120),
    rows,
    footer:clean(input.footer,260),
    source:clean(input.source,260),
    note:clean(input.note,260),
    updatedAt:new Date().toISOString(),updatedBy:String(admin?.id||'admin'),schemaVersion:1
  };
  if(!next.label||!next.headline)throw new Error('NOW ISSUE 라벨과 메인 제목을 입력해주세요.');
  await setJSON(NOW_ISSUE_KEY,next);return next;
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
async function surveyStats(survey,userId){
  const id=String(survey?.id||'');
  if(!id)return {counts:[],total:0,userVote:null};
  const [rawCounts,userVoteRaw]=await Promise.all([
    cmd(['HGETALL',SURVEY_COUNTS_PREFIX+id]).catch(()=>null),
    userId?cmd(['HGET',SURVEY_VOTES_PREFIX+id,String(userId)]).catch(()=>null):Promise.resolve(null)
  ]);
  const map=parseHash(rawCounts),counts=(survey.options||[]).map((_,i)=>Math.max(0,Number(map[String(i)]||0))),total=counts.reduce((a,b)=>a+b,0);
  const uv=userVoteRaw==null?null:Number(userVoteRaw);
  return {counts,total,userVote:Number.isInteger(uv)?uv:null};
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
module.exports={DEFAULT_NOW_ISSUE,DEFAULT_SURVEY,getNowIssue,saveNowIssue,getSurvey,saveSurvey,surveyStats,voteSurvey};
