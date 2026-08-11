const traffic=require('./_lib/traffic');
module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false});
  try{
    const b=req.body||{};
    const r=await traffic.track({name:String(b.name||''),type:String(b.type||''),session:String(b.session||'')});
    return res.status(r.ok?200:400).json(r);
  }catch(e){return res.status(200).json({ok:false});}
};
