const crypto=require('crypto');
const {cmd}=require('./store');

const ONLINE_KEY='jjdd:site:online:v2';
const TOTAL_HLL='jjdd:site:visitor:hll:all:v2';
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
  const day=kstDate(now),dayKey=`jjdd:site:visitor:hll:day:${day}:v2`;
  await cmd(['ZREMRANGEBYSCORE',ONLINE_KEY,'-inf',String(now-ONLINE_WINDOW_MS)]).catch(()=>{});
  const [online,today,total]=await Promise.all([
    cmd(['ZCARD',ONLINE_KEY]).catch(()=>0),
    cmd(['PFCOUNT',dayKey]).catch(()=>0),
    cmd(['PFCOUNT',TOTAL_HLL]).catch(()=>0)
  ]);
  return {online:Number(online||0),today:Number(today||0),total:Number(total||0),date:day,onlineWindowMinutes:5,metric:'anonymous-browser-unique'};
}
module.exports={touchVisitor,readStats,kstDate};
