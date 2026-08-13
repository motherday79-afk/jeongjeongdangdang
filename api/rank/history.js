const store=require('../../lib/store');

function disableCache(res){
  res.setHeader('Cache-Control','private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control','no-store');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
}

module.exports=async function handler(req,res){
  disableCache(res);
  try{
    const days=Math.max(1,Math.min(28,Number(req.query?.days)||7));
    const max=days*4-1;
    const [ids,current]=await Promise.all([
      store.lrange('jjdd:history',0,max),
      store.getJSON('jjdd:current').catch(()=>null)
    ]);
    const snapshots=[];
    for(const id of ids||[]){
      const s=await store.getJSON(`jjdd:snapshot:${id}`);
      if(s) snapshots.push({
        id:String(id),
        publicationId:s.publicationId||String(id),
        publishedAt:s.publishedAt||null,
        timestamp:s.timestamp,
        version:s.version,
        ranks:Object.fromEntries((s.members||[]).map(m=>[m.name,{rank:m.rank,score:m.score}]))
      });
    }
    return res.status(200).json({
      currentPublicationId:current?.publicationId||null,
      currentTimestamp:current?.timestamp||null,
      snapshots
    });
  }catch(e){
    return res.status(200).json({snapshots:[]});
  }
};
