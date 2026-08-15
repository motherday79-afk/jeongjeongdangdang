const crypto=require('crypto');
const store=require('./store');
const {cmd}=store;

const ONLINE_KEY='jjdd:site:online:v2';
const TOTAL_HLL='jjdd:site:visitor:hll:all:v2';
const DISPLAY_KEY='jjdd:site:visitor:display:v2';
const LEGACY_DISPLAY_KEY='jjdd:site:visitor:display:v1';
const DAILY_FINAL_PREFIX='jjdd:site:visitor:final:v2:';
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
function dayKey(day){return `jjdd:site:visitor:hll:day:${day}:v2`;}

async function countDay(day){
  return int(await cmd(['PFCOUNT',dayKey(day)]).catch(()=>0));
}

async function readRawStats(now=Date.now()){
  const day=kstDate(now);
  await cmd(['ZREMRANGEBYSCORE',ONLINE_KEY,'-inf',String(now-ONLINE_WINDOW_MS)]).catch(()=>{});
  const [online,today,total]=await Promise.all([
    cmd(['ZCARD',ONLINE_KEY]).catch(()=>0),
    countDay(day),
    cmd(['PFCOUNT',TOTAL_HLL]).catch(()=>0)
  ]);
  return {online:int(online),today:int(today),total:int(total),date:day};
}

async function readLegacyDisplayConfig(){
  try{
    const x=await store.getJSON(LEGACY_DISPLAY_KEY);
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

async function migrateDisplayState(now=Date.now()){
  const raw=await readRawStats(now);
  const legacy=await readLegacyDisplayConfig();
  const legacyToday=raw.today+int(legacy.todayBoost);
  const legacyTotal=Math.max(raw.total+int(legacy.totalBoost),legacyToday);
  const next={
    schemaVersion:2,
    date:raw.date,
    // On migration preserve exactly what the old UI was showing, but split it
    // into a permanent carry-over and today's live component.
    fixedTotal:Math.max(0,legacyTotal-legacyToday),
    todayBoost:int(legacy.todayBoost),
    totalBoost:0,
    migratedFrom:'display:v1',
    migratedAt:new Date(now).toISOString(),
    updatedAt:legacy.updatedAt||new Date(now).toISOString(),
    updatedBy:legacy.updatedBy||'system-migration'
  };
  await store.setJSON(DISPLAY_KEY,next);
  return next;
}

async function readDisplayStateRaw(now=Date.now()){
  try{
    const x=await store.getJSON(DISPLAY_KEY);
    if(x&&Number(x.schemaVersion)>=2&&x.date){
      return {
        schemaVersion:2,
        date:String(x.date),
        fixedTotal:int(x.fixedTotal),
        todayBoost:int(x.todayBoost),
        totalBoost:int(x.totalBoost),
        updatedAt:x.updatedAt||null,
        updatedBy:x.updatedBy||null,
        migratedAt:x.migratedAt||null,
        rolloverAt:x.rolloverAt||null
      };
    }
  }catch(_){}
  return migrateDisplayState(now);
}

function displayedForDay(rawToday,state){
  const today=int(rawToday)+int(state.todayBoost);
  const base=int(state.fixedTotal)+today;
  const total=Math.max(base+int(state.totalBoost),base,int(state.fixedTotal));
  return {today,total};
}

async function writeDailyFinal(date,payload){
  if(!date)return;
  await store.setJSON(DAILY_FINAL_PREFIX+date,{
    schemaVersion:1,
    date,
    ...payload
  }).catch(()=>{});
}

async function ensureDailyRollover(now=Date.now(),reason='request'){
  const currentDay=kstDate(now);
  let state=await readDisplayStateRaw(now);
  if(state.date===currentDay)return state;

  // Freeze the previous active day's displayed cumulative value. This is the
  // permanent floor for every following day, independent of later resets.
  const previousRawToday=await countDay(state.date);
  const previous=displayedForDay(previousRawToday,state);
  await writeDailyFinal(state.date,{
    today:previous.today,
    total:previous.total,
    rawToday:previousRawToday,
    fixedTotalBefore:int(state.fixedTotal),
    todayBoost:int(state.todayBoost),
    totalBoost:int(state.totalBoost),
    finalizedAt:new Date(now).toISOString(),
    reason:String(reason||'request')
  });

  state={
    schemaVersion:2,
    date:currentDay,
    fixedTotal:previous.total,
    todayBoost:0,
    totalBoost:0,
    rolloverAt:new Date(now).toISOString(),
    updatedAt:new Date(now).toISOString(),
    updatedBy:'system-rollover'
  };
  await store.setJSON(DISPLAY_KEY,state);
  return state;
}

async function readDisplayConfig(now=Date.now()){
  const state=await ensureDailyRollover(now,'read-display');
  return {...state};
}

function applyDisplay(raw,cfg){
  const values=displayedForDay(raw.today,cfg);
  return {
    online:raw.online,
    today:values.today,
    total:values.total,
    fixedTotal:int(cfg.fixedTotal),
    date:raw.date,
    onlineWindowMinutes:5,
    metric:'anonymous-browser-unique-daily-cumulative'
  };
}

async function touchVisitor(session){
  const clean=cleanSession(session);if(!clean)throw new Error('invalid visitor session');
  const now=Date.now();
  // Roll the previous KST day before this visit can be counted into the new day.
  await ensureDailyRollover(now,'first-visit-after-midnight');
  const day=kstDate(now),sid=token(clean),dKey=dayKey(day);
  await Promise.all([
    cmd(['PFADD',dKey,sid]),
    cmd(['PFADD',TOTAL_HLL,sid]),
    cmd(['ZADD',ONLINE_KEY,String(now),sid])
  ]);
  await cmd(['EXPIRE',dKey,String(120*24*3600)]).catch(()=>{});
  await cmd(['ZREMRANGEBYSCORE',ONLINE_KEY,'-inf',String(now-ONLINE_WINDOW_MS)]).catch(()=>{});
  await cmd(['EXPIRE',ONLINE_KEY,String(24*3600)]).catch(()=>{});
  return readStats(now);
}

async function readStats(now=Date.now()){
  const cfg=await ensureDailyRollover(now,'stats-read');
  const raw=await readRawStats(now);
  return applyDisplay(raw,cfg);
}

async function readAdminStats(now=Date.now()){
  const cfg=await ensureDailyRollover(now,'admin-read');
  const raw=await readRawStats(now);
  return {real:raw,display:applyDisplay(raw,cfg),adjustment:cfg};
}

async function setDisplayTargets({today,total,updatedBy}={},now=Date.now()){
  const cfg=await ensureDailyRollover(now,'admin-set');
  const raw=await readRawStats(now);
  const desiredToday=Math.floor(Number(today));
  const desiredTotal=Math.floor(Number(total));
  if(!Number.isFinite(desiredToday)||!Number.isFinite(desiredTotal)||desiredToday<0||desiredTotal<0){
    throw new Error('방문자 표시값은 0 이상의 숫자로 입력해주세요.');
  }
  if(desiredToday<raw.today){
    throw new Error(`오늘 표시값은 실제 오늘 집계보다 낮게 설정할 수 없습니다. 현재 실제 오늘 ${raw.today}`);
  }
  const minimumTotal=int(cfg.fixedTotal)+desiredToday;
  if(desiredTotal<minimumTotal){
    throw new Error(`누적 방문은 전일까지 확정된 ${int(cfg.fixedTotal).toLocaleString('ko-KR')}명 + 오늘 ${desiredToday.toLocaleString('ko-KR')}명 = 최소 ${minimumTotal.toLocaleString('ko-KR')}명 이상이어야 합니다.`);
  }
  const next={
    ...cfg,
    schemaVersion:2,
    date:raw.date,
    todayBoost:desiredToday-raw.today,
    totalBoost:desiredTotal-minimumTotal,
    updatedAt:new Date(now).toISOString(),
    updatedBy:String(updatedBy||'admin')
  };
  await store.setJSON(DISPLAY_KEY,next);
  return readAdminStats(now);
}

async function resetDisplayTargets(now=Date.now(),updatedBy='admin'){
  const cfg=await ensureDailyRollover(now,'admin-reset');
  const next={
    ...cfg,
    schemaVersion:2,
    todayBoost:0,
    totalBoost:0,
    updatedAt:new Date(now).toISOString(),
    updatedBy:String(updatedBy)
  };
  await store.setJSON(DISPLAY_KEY,next);
  return readAdminStats(now);
}

async function finalizeDaily(now=Date.now(),reason='cron'){
  const state=await ensureDailyRollover(now,reason);
  const stats=await readStats(now);
  return {state,stats};
}

module.exports={
  touchVisitor,readStats,readAdminStats,setDisplayTargets,resetDisplayTargets,finalizeDaily,
  ensureDailyRollover,readRawStats,readDisplayConfig,kstDate,DISPLAY_KEY,DAILY_FINAL_PREFIX
};
