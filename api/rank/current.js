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
    const current=await store.getJSON('jjdd:current');
    if(!current) return res.status(404).json({ok:false,error:'published snapshot not found'});
    return res.status(200).json(current);
  }catch(e){
    return res.status(503).json({ok:false,error:'backend not configured'});
  }
};
