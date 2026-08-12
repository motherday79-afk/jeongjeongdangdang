const {requireAdmin}=require('../../lib/auth');
const {credentials,queryKeywords}=require('../../lib/naver_searchad');

const DEFAULT_NAMES=['한동훈'];
const BENCHMARK_NAMES=['김민석','정청래','한동훈','서미화','김종민','천하람'];

function parseKeywords(req){
  if(req.method==='POST'){
    const body=req.body||{};
    if(Array.isArray(body.keywords))return body.keywords;
    if(body.keyword)return [body.keyword];
  }
  const q=req.query?.keywords||req.query?.keyword||'';
  if(q)return String(q).split(',');
  if(String(req.query?.benchmark||'')==='1') return BENCHMARK_NAMES;
  return DEFAULT_NAMES;
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'GET/POST only'});
  if(!requireAdmin(req,res))return;
  const c=credentials();
  if(!c.configured)return res.status(503).json({ok:false,configured:false,error:c.detail});
  const keywords=parseKeywords(req).map(x=>String(x||'').trim()).filter(Boolean).slice(0,20);
  try{
    const results=await queryKeywords(keywords.length?keywords:DEFAULT_NAMES);
    return res.status(200).json({
      ok:results.some(x=>x.ok),
      configured:true,
      provider:'NAVER Search Ads /keywordstool',
      note:'Probe only: this endpoint does not affect NOW Rank yet.',
      keywords:results.length,
      results
    });
  }catch(e){return res.status(500).json({ok:false,configured:true,error:e.message||String(e)});}
};
