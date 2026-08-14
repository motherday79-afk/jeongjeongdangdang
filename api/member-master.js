const {getMaster}=require('../lib/member_master');
module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method not allowed'});
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=21600, stale-while-revalidate=86400');
  try{return res.status(200).json(await getMaster());}
  catch(e){return res.status(503).json({ok:false,error:'국회 공식 의원정보를 불러오지 못했습니다.',detail:e?.message||String(e)});}
};
