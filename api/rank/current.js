const store=require('../../lib/store');
const {publicSnapshot}=require('../../lib/public_snapshot');
function publicCache(res){
  // Short edge cache removes repeated Redis/serverless latency without the long stale window
  // that previously caused old snapshots to reappear. No stale-while-revalidate is used.
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=30, must-revalidate');
  res.setHeader('CDN-Cache-Control','public, max-age=30');
  res.setHeader('Vercel-CDN-Cache-Control','public, max-age=30');
}
module.exports=async function handler(req,res){
  publicCache(res);
  try{
    let current=await store.getJSON('jjdd:current:public');
    if(!current){
      const full=await store.getJSON('jjdd:current');
      if(!full) return res.status(404).json({ok:false,error:'published snapshot not found'});
      current=publicSnapshot(full);
      // Best-effort warm-up. Failure must not block the public response.
      store.setJSON('jjdd:current:public',current).catch(()=>{});
    }
    return res.status(200).json(current);
  }catch(e){
    return res.status(503).json({ok:false,error:'backend not configured'});
  }
};
