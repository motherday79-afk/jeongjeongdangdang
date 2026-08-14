const {touchVisitor,readStats}=require('../../lib/site_stats');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET') return res.json({ok:true,stats:await readStats()});
    if(req.method==='POST') return res.json({ok:true,stats:await touchVisitor(req.body?.session)});
    return res.status(405).json({ok:false,error:'Method not allowed'});
  }catch(e){return res.status(400).json({ok:false,error:e.message||String(e)});}
};
