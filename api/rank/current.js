const store=require('../../lib/store');
const {publicSnapshot}=require('../../lib/public_snapshot');
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
