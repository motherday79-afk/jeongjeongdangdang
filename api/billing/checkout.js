const {requireUser,capabilities}=require('../../lib/user_auth');
const {PLANS,createCheckoutIntent}=require('../../lib/billing');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
  const user=await requireUser(req,res); if(!user) return;
  if(capabilities(user.role).plus) return res.json({ok:true,alreadyActive:true,message:'이미 PLUS 이상 등급을 이용 중입니다.'});
  const planCode=String(req.body?.planCode||'PLUS_MONTHLY');
  const plan=PLANS[planCode];
  if(!plan) return res.status(400).json({ok:false,error:'지원하지 않는 요금제입니다.'});
  try{
    const intent=await createCheckoutIntent(user,planCode);
    return res.status(202).json({
      ok:true,integrationReady:false,provider:'CMS',
      plan,
      checkoutIntent:{id:intent.id,status:intent.status,createdAt:intent.createdAt},
      message:'CMS 결제 연동을 위한 요청 구조까지 준비되어 있습니다. 현재 빌드에서는 실제 결제가 진행되지 않습니다.'
    });
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
