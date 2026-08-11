const store=require('./store');
const roster=require('../../data/roster.json');

const TYPES=new Set(['profile','search','compare']);
const KST=9*3600000;
function bucketStart(ms=Date.now()){
  const local=ms+KST;
  const six=6*3600000;
  return Math.floor(local/six)*six-KST;
}
function bucketKey(ms){return `jjdd:traffic:${bucketStart(ms)}`;}
function field(name,type){return `${name}|${type}`;}
function parseHash(raw){
  const out={};
  if(Array.isArray(raw)) for(let i=0;i<raw.length;i+=2) out[raw[i]]=Number(raw[i+1]||0);
  else if(raw&&typeof raw==='object') for(const [k,v] of Object.entries(raw)) out[k]=Number(v||0);
  return out;
}
async function track({name,type,session}){
  if(!TYPES.has(type)) return {ok:false,reason:'invalid type'};
  if(!roster.some(x=>x.name===name&&x.id!==300)) return {ok:false,reason:'invalid member'};
  const safeSession=String(session||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
  if(!safeSession) return {ok:false,reason:'missing session'};
  const b=bucketStart();
  const dedupe=`jjdd:td:${b}:${safeSession}:${type}:${name}`;
  const accepted=await store.setNx(dedupe,'1',900);
  if(!accepted) return {ok:true,deduped:true};
  await store.hincrby(`jjdd:traffic:${b}`,field(name,type),1);
  await store.expire(`jjdd:traffic:${b}`,40*24*3600);
  return {ok:true,deduped:false,bucket:b};
}
async function readTrafficSignals(active){
  const now=bucketStart();
  const keys=Array.from({length:29},(_,i)=>`jjdd:traffic:${now-i*6*3600000}`);
  let hashes=[];
  try{hashes=await Promise.all(keys.map(k=>store.hgetall(k).then(parseHash).catch(()=>({}))));}
  catch(e){hashes=[];}
  const result={};
  for(const m of active){
    const read=(h,t)=>Number(h[field(m.name,t)]||0);
    const aggregate=h=>(read(h,'profile')+1.4*read(h,'search')+1.2*read(h,'compare'));
    const current=aggregate(hashes[0]||{});
    const prev24=(hashes.slice(1,5).reduce((a,h)=>a+aggregate(h),0))/4;
    const prev7=(hashes.slice(1,29).reduce((a,h)=>a+aggregate(h),0))/28;
    const detail={profile6:read(hashes[0]||{},'profile'),search6:read(hashes[0]||{},'search'),compare6:read(hashes[0]||{},'compare')};
    result[m.name]={count6:current,baseline24:prev24,baseline7d:prev7,...detail};
  }
  return result;
}
module.exports={track,readTrafficSignals,bucketStart};
