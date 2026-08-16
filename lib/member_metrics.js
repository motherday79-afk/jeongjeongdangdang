const {cmd}=require('./store');
const {activeRoster,findEntity}=require('./political_roster');

const KEY='jjdd:member:metrics:v1';
const AXES=['언론 주목도','대중 관심도','디지털 영향력','대중 반응도','정책 활동도','의정 활동도','정치 영향력','인지도'];

function parseHash(v){
  if(!v)return{};
  if(!Array.isArray(v)&&typeof v==='object')return v;
  const out={};for(let i=0;i<(v||[]).length;i+=2)out[String(v[i])]=v[i+1];return out;
}
function gradeFromScore(v){const n=Number(v);return n>=91?'S':n>=81?'A':n>=71?'B':n>=60?'C':'D';}
function sanitizeValues(input){
  const raw=Array.isArray(input)?input:(Array.isArray(input?.values)?input.values:[]);
  if(raw.length!==AXES.length)throw new Error(`능력치는 ${AXES.length}개 항목을 모두 입력해주세요.`);
  return raw.map((v,i)=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>100)throw new Error(`${AXES[i]} 값은 0~100 사이로 입력해주세요.`);return Math.round(n*10)/10;});
}
function normalizeOverride(v){
  if(!v)return null;let row=v;
  if(typeof v==='string'){try{row=JSON.parse(v);}catch(_){return null;}}
  if(!row||!Array.isArray(row.values)||row.values.length!==AXES.length)return null;
  try{return {...row,values:sanitizeValues(row.values)};}catch(_){return null;}
}
async function getAllOverrides(){
  const raw=parseHash(await cmd(['HGETALL',KEY]).catch(()=>null));const out={};
  for(const [id,v] of Object.entries(raw)){const row=normalizeOverride(v);if(row)out[String(id)]=row;}
  return out;
}
async function getOverride(id){const raw=await cmd(['HGET',KEY,String(id)]).catch(()=>null);return normalizeOverride(raw);}
function applyOverride(metrics,override){
  const ov=normalizeOverride(override);if(!ov)return Array.isArray(metrics)?metrics:[];
  return AXES.map((label,i)=>[label,gradeFromScore(ov.values[i]),ov.values[i]]);
}
async function saveOverride(id,input,admin){
  const num=Number(id),entity=findEntity(num);
  if(!Number.isInteger(num)||!entity||num===300||entity.entityType==='government')throw new Error('NOW Rank 정치인을 찾을 수 없습니다.');
  const values=sanitizeValues(input),row={id:num,values,updatedAt:new Date().toISOString(),updatedBy:String(admin?.id||'admin'),schemaVersion:1};
  await cmd(['HSET',KEY,String(num),JSON.stringify(row)]);return row;
}
async function resetOverride(id){await cmd(['HDEL',KEY,String(Number(id))]);return true;}
function publicOverrides(map){const out={};for(const [id,row] of Object.entries(map||{})){const ov=normalizeOverride(row);if(ov)out[id]={values:ov.values};}return out;}
function roster(){return activeRoster();}
module.exports={KEY,AXES,gradeFromScore,sanitizeValues,getAllOverrides,getOverride,applyOverride,saveOverride,resetOverride,publicOverrides,roster};
