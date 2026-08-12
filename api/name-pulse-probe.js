const {credentials,queryKeyword}=require('./_lib/naver_searchad');
module.exports=async function handler(req,res){
  // Temporary fixed-keyword diagnostic. Does not expose credentials or accept arbitrary keywords.
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=1800');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'GET only'});
  const c=credentials();
  if(!c.configured) return res.status(503).json({ok:false,configured:false,error:c.detail});
  try{
    const result=await queryKeyword('한동훈');
    return res.status(200).json({
      ok:true,
      configured:true,
      provider:'NAVER Search Ads /keywordstool',
      probeKeyword:'한동훈',
      result,
      note:'Fixed diagnostic probe only; NOW Rank is not changed.'
    });
  }catch(e){
    return res.status(e.status&&Number.isInteger(e.status)?e.status:500).json({
      ok:false,
      configured:true,
      probeKeyword:'한동훈',
      error:e.message||String(e),
      status:e.status||null
    });
  }
};
