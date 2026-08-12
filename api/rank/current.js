const store=require('../../lib/store');
module.exports=async function handler(req,res){
  try{
    const current=await store.getJSON('jjdd:current');
    if(!current) return res.status(404).json({ok:false,error:'published snapshot not found'});
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(current);
  }catch(e){return res.status(503).json({ok:false,error:'backend not configured'});}
};