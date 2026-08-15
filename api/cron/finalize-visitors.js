const {finalizeDaily}=require('../../lib/site_stats');

module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed'});
  const secret=String(process.env.CRON_SECRET||'').trim();
  if(secret){
    const auth=String(req.headers?.authorization||'');
    if(auth!==`Bearer ${secret}`)return res.status(401).json({ok:false,error:'Unauthorized'});
  }
  try{
    const out=await finalizeDaily(Date.now(),'vercel-cron-kst-midnight');
    return res.json({ok:true,date:out.stats.date,stats:out.stats});
  }catch(e){
    return res.status(500).json({ok:false,error:e.message||String(e)});
  }
};
