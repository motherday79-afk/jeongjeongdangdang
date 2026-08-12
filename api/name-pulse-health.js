const {credentials}=require('./_lib/naver_searchad');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'GET only'});
  const c=credentials();
  return res.status(200).json({
    ok:true,
    route:'name-pulse-health',
    configured:c.configured,
    accessLicense:Boolean(c.accessLicense),
    secretKey:Boolean(c.secretKey),
    customerId:Boolean(c.customerId),
    providerBase:'https://api.searchad.naver.com',
    note:'Public diagnostic only. Secret values are never returned. No NAVER request was made.'
  });
};
