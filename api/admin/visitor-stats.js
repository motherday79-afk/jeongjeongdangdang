const {requireAdmin}=require('../../lib/auth');
const {readAdminStats,setDisplayTargets,setDisplayVisibility,resetDisplayTargets}=require('../../lib/site_stats');

module.exports=async function(req,res){
  const admin=requireAdmin(req,res);if(!admin)return;
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET') return res.json({ok:true,stats:await readAdminStats()});
    if(req.method==='POST'){
      const b=req.body||{};
      if(b.action==='reset') return res.json({ok:true,stats:await resetDisplayTargets(Date.now(),admin.id)});
      if(b.action==='visibility') return res.json({ok:true,stats:await setDisplayVisibility({online:b.online,today:b.today,total:b.total,updatedBy:admin.id})});
      const stats=await setDisplayTargets({today:b.today,total:b.total,updatedBy:admin.id});
      return res.json({ok:true,stats});
    }
    return res.status(405).json({ok:false,error:'Method not allowed'});
  }catch(e){return res.status(400).json({ok:false,error:e.message||String(e)});}
};
