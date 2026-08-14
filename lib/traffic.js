const store=require('./store');
const roster=require('../data/roster.json');
const {memberKey}=require('./member_key');

const TYPES=new Set(['profile','search','compare']);
const KST=9*3600000;
const activeRoster=roster.filter(x=>x.id!==300&&x.party!=='공석');
const nameCounts=activeRoster.reduce((m,x)=>(m[x.name]=(m[x.name]||0)+1,m),{});
function bucketStart(ms=Date.now()){
  const local=ms+KST;
  const six=6*3600000;
  return Math.floor(local/six)*six-KST;
}
function bucketKey(ms){return `jjdd:traffic:${bucketStart(ms)}`;}
function field(identity,type){return `${identity}|${type}`;}
function parseHash(raw){
  const out={};
  if(Array.isArray(raw)) for(let i=0;i<raw.length;i+=2) out[raw[i]]=Number(raw[i+1]||0);
  else if(raw&&typeof raw==='object') for(const [k,v] of Object.entries(raw)) out[k]=Number(v||0);
  return out;
}
function resolveMember({memberId,name}){
  if(Number.isFinite(Number(memberId))){
    const m=activeRoster.find(x=>Number(x.id)===Number(memberId));
    if(m && (!name||m.name===name))return m;
  }
  const matches=activeRoster.filter(x=>x.name===String(name||''));
  return matches.length===1?matches[0]:null;
}
async function track({memberId,name,type,session}){
  if(!TYPES.has(type)) return {ok:false,reason:'invalid type'};
  const member=resolveMember({memberId,name});
  if(!member) return {ok:false,reason:'invalid or ambiguous member'};
  const safeSession=String(session||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
  if(!safeSession) return {ok:false,reason:'missing session'};
  const b=bucketStart(),identity=memberKey(member);
  const dedupe=`jjdd:td:${b}:${safeSession}:${type}:${identity}`;
  const accepted=await store.setNx(dedupe,'1',900);
  if(!accepted) return {ok:true,deduped:true};
  await store.hincrby(`jjdd:traffic:${b}`,field(identity,type),1);
  await store.expire(`jjdd:traffic:${b}`,40*24*3600);
  return {ok:true,deduped:false,bucket:b,memberId:member.id};
}
async function readTrafficSignals(active){
  const now=bucketStart();
  const keys=Array.from({length:29},(_,i)=>`jjdd:traffic:${now-i*6*3600000}`);
  let hashes=[];
  try{hashes=await Promise.all(keys.map(k=>store.hgetall(k).then(parseHash).catch(()=>({}))));}
  catch(e){hashes=[];}
  const result={};
  for(const m of active){
    const identity=memberKey(m);
    const read=(h,t)=>{
      const byId=Number(h[field(identity,t)]||0);
      // Backward compatibility with legacy name-keyed traffic is safe only for unique names.
      const legacy=nameCounts[m.name]===1?Number(h[field(m.name,t)]||0):0;
      return byId+legacy;
    };
    const aggregate=h=>(read(h,'profile')+1.4*read(h,'search')+1.2*read(h,'compare'));
    const current=aggregate(hashes[0]||{});
    const prev24=(hashes.slice(1,5).reduce((a,h)=>a+aggregate(h),0))/4;
    const prev7=(hashes.slice(1,29).reduce((a,h)=>a+aggregate(h),0))/28;
    const detail={profile6:read(hashes[0]||{},'profile'),search6:read(hashes[0]||{},'search'),compare6:read(hashes[0]||{},'compare')};
    result[identity]={count6:current,baseline24:prev24,baseline7d:prev7,...detail};
  }
  return result;
}
module.exports={track,readTrafficSignals,bucketStart};
