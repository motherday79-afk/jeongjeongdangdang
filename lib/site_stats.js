const crypto=require('crypto');
const store=require('./store');
const {cmd}=store;

const ONLINE_KEY='jjdd:site:online:v2';
const TOTAL_HLL='jjdd:site:visitor:hll:all:v2';
const DISPLAY_KEY='jjdd:site:visitor:display:v1';
const ONLINE_WINDOW_MS=5*60*1000;

function kstDate(ts=Date.now()){
  const d=new Date(ts+9*60*60*1000);
  return d.toISOString().slice(0,10);
}
function cleanSession(v){
  const s=String(v||'').trim();
  return /^[A-Za-z0-9_-]{12,120}$/.test(s)?s:null;
}
function token(v){return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0,32);}
function int(v){const n=Math.floor(Number(v));return Number.isFinite(n)&&n>=0?n:0;}

async function readRawStats(now=Date.now()){
  const day=kstDate(now),dayKey=`jjdd:site:visitor:hll:day:${day}:v2`;
  await cmd(['ZREMRANGEBYSCORE',ONLINE_KEY,'-inf',String(now-ONLINE_WINDOW_MS)]).catch(()=>{});
  const [online,today,total]=await Promise.all([
    cmd(['ZCARD',ONLINE_KEY]).catch(()=>0),
    cmd(['PFCOUNT',dayKey]).catch(()=>0),
    cmd(['PFCOUNT',TOTAL_HLL]).catch(()=>0)
  ]);
  return {online:int(online),today:int(today),total:int(total),date:day};
}

async function readDisplayConfig(){
  try{
    const x=await store.getJSON(DISPLAY_KEY);
    return {
      todayBoost:int(x?.todayBoost),
      totalBoost:int(x?.totalBoost),
      updatedAt:x?.updatedAt||null,
      updatedBy:x?.updatedBy||null
    };
  }catch(_){
    return {todayBoost:0,totalBoost:0,updatedAt:null,updatedBy:null};
  }
}

function applyDisplay(raw,cfg){
  const today=raw.today+int(cfg.todayBoost);
  // Never allow the displayed cumulative count to look lower than today's count.
  const total=Math.max(raw.total+int(cfg.totalBoost),today);
  return {
    online:raw.online,
    today,
    total,
    date:raw.date,
    onlineWindowMinutes:5,
    metric:'anonymous-browser-unique'
  };
}

async function touchVisitor(session){
  const clean=cleanSession(session);if(!clean)throw new Error('invalid visitor session');
  const now=Date.now(),day=kstDate(now),sid=token(clean),dayKey=`jjdd:site:visitor:hll:day:${day}:v2`;
  await Promise.all([
    cmd(['PFADD',dayKey,sid]),
    cmd(['PFADD',TOTAL_HLL,sid]),
    cmd(['ZADD',ONLINE_KEY,String(now),sid])
  ]);
  await cmd(['EXPIRE',dayKey,String(120*24*3600)]).catch(()=>{});
  await cmd(['ZREMRANGEBYSCORE',ONLINE_KEY,'-inf',String(now-ONLINE_WINDOW_MS)]).catch(()=>{});
  await cmd(['EXPIRE',ONLINE_KEY,String(24*3600)]).catch(()=>{});
  return readStats(now);
}

async function readStats(now=Date.now()){
  const [raw,cfg]=await Promise.all([readRawStats(now),readDisplayConfig()]);
  return applyDisplay(raw,cfg);
}

async function readAdminStats(now=Date.now()){
  const [raw,cfg]=await Promise.all([readRawStats(now),readDisplayConfig()]);
  return {real:raw,display:applyDisplay(raw,cfg),adjustment:cfg};
}

async function setDisplayTargets({today,total,updatedBy}={},now=Date.now()){
  const raw=await readRawStats(now);
  const desiredToday=Math.floor(Number(today));
  const desiredTotal=Math.floor(Number(total));
  if(!Number.isFinite(desiredToday)||!Number.isFinite(desiredTotal)||desiredToday<0||desiredTotal<0){
    throw new Error('방문자 표시값은 0 이상의 숫자로 입력해주세요.');
  }
  if(desiredToday<raw.today||desiredTotal<raw.total){
    throw new Error(`실제 집계보다 낮게 설정할 수 없습니다. 현재 실제값: 오늘 ${raw.today}, 누적 ${raw.total}`);
  }
  if(desiredTotal<desiredToday){
    throw new Error('누적 방문은 오늘 방문보다 같거나 커야 합니다.');
  }
  const next={
    schemaVersion:1,
    todayBoost:desiredToday-raw.today,
    totalBoost:desiredTotal-raw.total,
    updatedAt:new Date(now).toISOString(),
    updatedBy:String(updatedBy||'admin')
  };
  await store.setJSON(DISPLAY_KEY,next);
  return readAdminStats(now);
}

async function resetDisplayTargets(now=Date.now(),updatedBy='admin'){
  const next={schemaVersion:1,todayBoost:0,totalBoost:0,updatedAt:new Date(now).toISOString(),updatedBy:String(updatedBy)};
  await store.setJSON(DISPLAY_KEY,next);
  return readAdminStats(now);
}

module.exports={
  touchVisitor,readStats,readAdminStats,setDisplayTargets,resetDisplayTargets,
  readRawStats,readDisplayConfig,kstDate,DISPLAY_KEY
};
