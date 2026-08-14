const {activeRoster}=require('../../lib/political_roster');
const {requireUser,capabilities,saveUser}=require('../../lib/user_auth');
const {plusState,mutatePlusState}=require('../../lib/plus');

const activeIds=new Set(activeRoster().map(x=>Number(x.id))); 

module.exports=async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  const user=await requireUser(req,res); if(!user) return;
  const canUse=capabilities(user.role).plus;
  if(req.method==='GET'){
    return res.json({ok:true,canUsePlus:canUse,state:plusState(user)});
  }
  if(!['POST','PATCH','DELETE'].includes(req.method)) return res.status(405).json({ok:false,error:'Method not allowed'});
  if(!canUse) return res.status(403).json({ok:false,error:'PLUS 멤버십이 필요한 기능입니다.',requires:'PLUS'});
  const b=req.body||{};
  try{
    if(['addPolitician','removePolitician'].includes(String(b.action||'')) && !activeIds.has(Number(b.memberId))){
      return res.status(400).json({ok:false,error:'현재 정치인 명단에서 확인되지 않는 대상입니다.'});
    }
    const state=mutatePlusState(user,b.action,b);
    await saveUser(user);
    return res.json({ok:true,canUsePlus:true,state});
  }catch(e){
    return res.status(400).json({ok:false,error:e.message||String(e)});
  }
};
