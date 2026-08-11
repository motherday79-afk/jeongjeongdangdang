const store=require('../_lib/store');
module.exports=async function handler(req,res){
  try{
    const days=Math.max(1,Math.min(28,Number(req.query?.days)||7));
    const max=days*4-1;
    const ids=await store.lrange('jjdd:history',0,max);
    const snapshots=[];
    for(const id of ids||[]){
      const s=await store.getJSON(`jjdd:snapshot:${id}`);
      if(s) snapshots.push({timestamp:s.timestamp,version:s.version,ranks:Object.fromEntries((s.members||[]).map(m=>[m.name,{rank:m.rank,score:m.score}]))});
    }
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=60');
    return res.status(200).json({snapshots});
  }catch(e){return res.status(200).json({snapshots:[]});}
};