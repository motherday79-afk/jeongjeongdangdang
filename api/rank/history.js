const store=require('../../lib/store');
const {RANK_HISTORY_KEY,parseRankPoint,compactRankPoint,stampOf}=require('../../lib/rank_history');

function disableCache(res){
  res.setHeader('Cache-Control','private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control','no-store');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
}
function parseJSON(v){try{return v==null?null:JSON.parse(v)}catch(e){return null}}
function snapshotStamp(s){return stampOf(s)}
function findMember(snapshot,{id,name}){
  const rows=snapshot?.members||[];
  if(Number.isFinite(Number(id))){
    const m=rows.find(x=>Number(x?.id)===Number(id));
    if(m && (!name||String(m.name||'')===name))return m;
    return null;
  }
  if(!name)return null;
  const matches=rows.filter(x=>String(x?.name||'')===name);
  return matches.length===1?matches[0]:null;
}
function compactMember(point,id){
  const rows=Array.isArray(point?.members)?point.members:[];
  const row=rows.find(x=>Array.isArray(x)&&Number(x[0])===Number(id));
  if(!row)return null;
  return {rank:Number(row[1]),score:Number.isFinite(Number(row[2]))?Number(row[2]):null};
}
function formatLabel(point){
  const dt=point?.publishedAt||point?.timestamp||'';
  try{
    const d=point?.publishedAt?new Date(point.publishedAt):new Date(String(point?.timestamp||'').replace(' KST','+09:00').replace(' ','T'));
    if(Number.isFinite(d.getTime())){
      const parts=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
      const get=t=>parts.find(p=>p.type===t)?.value||'';
      return `${get('month')}.${get('day')} ${get('hour')}:${get('minute')}`;
    }
  }catch(_){ }
  return String(dt).slice(5,16);
}
function mergePoints(longPoints,fullSnaps){
  const map=new Map();
  for(const s of fullSnaps){
    const p=compactRankPoint(s,s?.rollbackOf?'ROLLBACK':'LEGACY');
    const key=String(p.publicationId||p.stamp);
    map.set(key,p);
  }
  for(const p of longPoints){
    if(!p)continue;
    const key=String(p.publicationId||p.stamp);
    map.set(key,p); // explicit long-term record wins
  }
  return [...map.values()].sort((a,b)=>Number(a.stamp||0)-Number(b.stamp||0));
}

module.exports=async function handler(req,res){
  disableCache(res);
  try{
    const days=Math.max(1,Math.min(365,Number(req.query?.days)||30));
    const personName=String(req.query?.name||'').trim();
    const personId=Number(req.query?.id);
    const hasPerson=personName||Number.isFinite(personId);

    const [rawLong,ids,current]=await Promise.all([
      store.lrange(RANK_HISTORY_KEY,0,1499).catch(()=>[]),
      store.lrange('jjdd:history',0,111).catch(()=>[]),
      store.getJSON('jjdd:current').catch(()=>null)
    ]);

    const longPoints=(Array.isArray(rawLong)?rawLong:[]).map(parseRankPoint).filter(Boolean);
    const list=Array.isArray(ids)?ids:[];
    let raws=[];
    if(list.length){
      try{raws=await store.cmd(['MGET',...list.map(id=>`jjdd:snapshot:${id}`)]);}catch(_){raws=[];}
    }
    const full=list.map((id,i)=>parseJSON(raws?.[i])).filter(Boolean);
    const all=mergePoints(longPoints,full);
    const cutoff=Date.now()-days*24*60*60*1000;
    const currentRoster=String(current?.rosterVersion||'');
    let points=all.filter(p=>Number(p?.stamp||0)>=cutoff && (!currentRoster||String(p?.rosterVersion||'')===currentRoster));
    if(!points.length){
      points=all.filter(p=>(!currentRoster||String(p?.rosterVersion||'')===currentRoster)).slice(-Math.max(2,Math.min(120,days*4)));
    }

    if(hasPerson){
      const series=points.map(p=>{
        let m=null;
        if(Number.isFinite(personId))m=compactMember(p,personId);
        // Legacy full snapshots are already folded into compact points, and rosterVersion prevents
        // a new occupant from inheriting an old occupant's time series at the same roster slot.
        if(!m||!Number.isFinite(Number(m.rank)))return null;
        return {
          publicationId:p.publicationId||null,
          publishedAt:p.publishedAt||null,
          timestamp:p.timestamp||null,
          stamp:Number(p.stamp||0),
          label:formatLabel(p),
          rank:Number(m.rank),
          score:Number.isFinite(Number(m.score))?Number(m.score):null,
          mode:String(p.mode||'LEGACY').toUpperCase()
        };
      }).filter(Boolean).sort((a,b)=>a.stamp-b.stamp);
      return res.status(200).json({
        id:Number.isFinite(personId)?personId:null,name:personName,days,
        currentPublicationId:current?.publicationId||null,currentTimestamp:current?.timestamp||null,
        retainedPoints:1500,series
      });
    }

    // Keep the old generic response contract for any remaining admin/debug callers.
    const snapshots=full.map(s=>{
      const active=s.members||[];
      const nameCounts=active.reduce((acc,m)=>(acc[m.name]=(acc[m.name]||0)+1,acc),{});
      return {
        id:String(s.publicationId||''),publicationId:s.publicationId||null,
        publishedAt:s.publishedAt||null,timestamp:s.timestamp,version:s.version,
        ranksById:Object.fromEntries(active.map(m=>[String(m.id),{name:m.name,rank:m.rank,score:m.score}])),
        ranks:Object.fromEntries(active.filter(m=>nameCounts[m.name]===1).map(m=>[m.name,{rank:m.rank,score:m.score,id:m.id}]))
      };
    });
    return res.status(200).json({currentPublicationId:current?.publicationId||null,currentTimestamp:current?.timestamp||null,snapshots});
  }catch(e){
    const personName=String(req.query?.name||'').trim(),personId=Number(req.query?.id);
    return res.status(200).json((personName||Number.isFinite(personId))?{id:Number.isFinite(personId)?personId:null,name:personName,series:[]}:{snapshots:[]});
  }
};
