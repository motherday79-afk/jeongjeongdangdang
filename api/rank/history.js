const store=require('../../lib/store');
function disableCache(res){
  res.setHeader('Cache-Control','private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control','no-store');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
}
function parseJSON(v){try{return v==null?null:JSON.parse(v)}catch(e){return null}}
function snapshotStamp(s){
  const pub=Number(s?.publicationId||0); if(Number.isFinite(pub)&&pub>0)return pub;
  const iso=Date.parse(s?.publishedAt||''); if(Number.isFinite(iso))return iso;
  const kst=String(s?.timestamp||'').replace(' KST','+09:00').replace(' ','T');
  const t=Date.parse(kst); return Number.isFinite(t)?t:0;
}
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
module.exports=async function handler(req,res){
  disableCache(res);
  try{
    const days=Math.max(1,Math.min(28,Number(req.query?.days)||7));
    const personName=String(req.query?.name||'').trim();
    const personId=Number(req.query?.id);
    const hasPerson=personName||Number.isFinite(personId);
    const [ids,current]=await Promise.all([
      store.lrange('jjdd:history',0,111),
      store.getJSON('jjdd:current').catch(()=>null)
    ]);
    const list=Array.isArray(ids)?ids:[];
    let raws=[];
    if(list.length){
      try{raws=await store.cmd(['MGET',...list.map(id=>`jjdd:snapshot:${id}`)]);}catch(e){raws=[];}
    }
    let full=list.map((id,i)=>parseJSON(raws?.[i])).filter(Boolean);
    const cutoff=Date.now()-days*24*60*60*1000;
    const dated=full.filter(s=>snapshotStamp(s)>=cutoff);
    if(dated.length) full=dated;
    else full=full.slice(0,Math.max(2,days*4));

    if(hasPerson){
      const series=full.map(s=>{
        const m=findMember(s,{id:personId,name:personName});
        if(!m||!Number.isFinite(Number(m.rank)))return null;
        const stamp=snapshotStamp(s),dt=s.publishedAt||s.timestamp||'';
        let label='';
        try{
          const d=s.publishedAt?new Date(s.publishedAt):new Date(String(s.timestamp||'').replace(' KST','+09:00').replace(' ','T'));
          if(Number.isFinite(d.getTime())){
            const parts=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
            const get=t=>parts.find(p=>p.type===t)?.value||'';
            label=`${get('month')}.${get('day')} ${get('hour')}:${get('minute')}`;
          }
        }catch(_){ }
        return {publicationId:s.publicationId||null,publishedAt:s.publishedAt||null,timestamp:s.timestamp||null,stamp,label:label||String(dt).slice(5,16),rank:Number(m.rank),score:Number.isFinite(Number(m.score))?Number(m.score):null};
      }).filter(Boolean).sort((a,b)=>a.stamp-b.stamp);
      return res.status(200).json({id:Number.isFinite(personId)?personId:null,name:personName,days,currentPublicationId:current?.publicationId||null,currentTimestamp:current?.timestamp||null,series});
    }

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
