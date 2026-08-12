const {credentials,queryKeyword,queryKeywords}=require('../lib/naver_searchad');

const BENCHMARKS=[
  {keyword:'김민석',reference:459000},
  {keyword:'정청래',reference:408000},
  {keyword:'한동훈',reference:291000},
  {keyword:'서미화',reference:85000},
  {keyword:'김종민',reference:47000},
  {keyword:'천하람',reference:19000}
];

function compare(result, reference){
  const actual=Number(result?.monthlyTotalQcCnt||0);
  const delta=actual-reference;
  const deltaPct=reference?delta/reference*100:null;
  const absPct=deltaPct==null?null:Math.abs(deltaPct);
  return {
    referenceMonthlyTotalQcCnt:reference,
    delta,
    deltaPct:deltaPct==null?null:Number(deltaPct.toFixed(2)),
    verdict:absPct==null?'UNKNOWN':absPct<=3?'MATCH':absPct<=10?'CLOSE':'CHECK'
  };
}

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

  if(!['probe','benchmark'].includes(mode)){
    return res.status(400).json({ok:false,error:'mode must be health, probe, or benchmark'});
  }
  if(!c.configured) return res.status(503).json({ok:false,configured:false,error:c.detail});

  if(mode==='probe'){
    try{
      const result=await queryKeyword('한동훈');
      return res.status(200).json({
        ok:true,
        configured:true,
        mode:'probe',
        provider:'NAVER Search Ads /keywordstool',
        probeKeyword:'한동훈',
        result,
        note:'Fixed diagnostic probe only; This diagnostic call does not publish or change NOW Rank; v1.11 uses the same provider during Admin Refresh.'
      });
    }catch(e){
      return res.status(e.status&&Number.isInteger(e.status)?e.status:500).json({
        ok:false,configured:true,mode:'probe',probeKeyword:'한동훈',
        error:e.message||String(e),status:e.status||null
      });
    }
  }

  try{
    const keywords=BENCHMARKS.map(x=>x.keyword);
    const raw=await queryKeywords(keywords);
    const results=raw.map((row,i)=>({
      ...row,
      ...compare(row,BENCHMARKS[i].reference)
    }));
    const succeeded=results.filter(x=>x.ok&&x.found);
    const matched=succeeded.filter(x=>x.verdict==='MATCH').length;
    const close=succeeded.filter(x=>x.verdict==='CLOSE').length;
    const checked=succeeded.filter(x=>x.verdict==='CHECK').length;
    return res.status(200).json({
      ok:succeeded.length===BENCHMARKS.length,
      configured:true,
      mode:'benchmark',
      provider:'NAVER Search Ads /keywordstool',
      benchmarkCount:BENCHMARKS.length,
      succeeded:succeeded.length,
      summary:{match:matched,close,check:checked},
      results,
      note:'Six-name fixed benchmark only; This diagnostic call does not publish or change NOW Rank; v1.11 uses the same provider during Admin Refresh. Reference values are the previously observed KeywordCockpit monthly totals.'
    });
  }catch(e){
    return res.status(500).json({ok:false,configured:true,mode:'benchmark',error:e.message||String(e)});
  }
};
