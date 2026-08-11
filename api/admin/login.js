const {loginAllowed,sessionCookie}=require('../_lib/auth');
module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST only'});
  try{
    const body=req.body||{};
    if(!loginAllowed(body.id,body.password)) return res.status(401).json({ok:false,error:'아이디 또는 비밀번호가 올바르지 않습니다.'});
    res.setHeader('Set-Cookie',sessionCookie(body.id));
    return res.status(200).json({ok:true,id:body.id});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};