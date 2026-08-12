const {credentials,queryKeyword}=require('../lib/naver_searchad');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'GET only'});
  const mode=String(req.query?.mode||'health').toLowerCase();
  const c=credentials();
  if(mode==='health'){
    return res.status(200).json({
      ok:true,
      route:'name-pulse-test',
      mode:'health',
      configured:c.configured,
      accessLicense:Boolean(c.accessLicense),
      secretKey:Boolean(c.secretKey),
      customerId:Boolean(c.customerId),
      providerBase:'https://api.searchad.naver.com',
      note:'Public diagnostic only. Secret values are never returned. No NAVER request was made.'
    });
  }
  if(mode!=='probe') return res.status(400).json({ok:false,error:'mode must be health or probe'});
  if(!c.configured) return res.status(503).json({ok:false,configured:false,error:c.detail});
  try{
    const result=await queryKeyword('한동훈');
    return res.status(200).json({
      ok:true,
      configured:true,
      mode:'probe',
      provider:'NAVER Search Ads /keywordstool',
      probeKeyword:'한동훈',
      result,
      note:'Fixed diagnostic probe only; NOW Rank is not changed.'
    });
  }catch(e){
    return res.status(e.status&&Number.isInteger(e.status)?e.status:500).json({
      ok:false,
      configured:true,
      mode:'probe',
      probeKeyword:'한동훈',
      error:e.message||String(e),
      status:e.status||null
    });
  }
};
