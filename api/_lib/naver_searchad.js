const crypto=require('crypto');

const BASE_URL='https://api.naver.com';
const PATH='/keywordstool';

function credentials(){
  const accessLicense=String(process.env.NAVER_AD_ACCESS_LICENSE||'').trim();
  const secretKey=String(process.env.NAVER_AD_SECRET_KEY||'').trim();
  const customerId=String(process.env.NAVER_AD_CUSTOMER_ID||'').trim();
  return {
    configured:Boolean(accessLicense&&secretKey&&customerId),
    accessLicense,secretKey,customerId,
    detail:accessLicense&&secretKey&&customerId?'NAVER Search Ads credentials configured':'Set NAVER_AD_ACCESS_LICENSE, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID'
  };
}

function signature(timestamp,method,path,secretKey){
  return crypto.createHmac('sha256',secretKey)
    .update(`${timestamp}.${method}.${path}`)
    .digest('base64');
}

function numericSearchCount(v){
  // NAVER may return values like "< 10" for low-volume keywords.
  if(typeof v==='number'&&Number.isFinite(v)) return v;
  const s=String(v??'').trim().replace(/,/g,'');
  if(!s) return 0;
  if(/^<\s*10$/i.test(s)) return 5; // midpoint estimate, raw value is preserved separately
  const n=Number(s.replace(/[^0-9.\-]/g,''));
  return Number.isFinite(n)?n:0;
}

async function queryKeyword(keyword,{showDetail=true}={}){
  const c=credentials();
  if(!c.configured){
    const err=new Error(c.detail);err.code='NAVER_AD_NOT_CONFIGURED';throw err;
  }
  const timestamp=String(Date.now());
  const method='GET';
  const params=new URLSearchParams({hintKeywords:String(keyword||'').trim(),showDetail:showDetail?'1':'0'});
  const url=`${BASE_URL}${PATH}?${params.toString()}`;
  const headers={
    'X-Timestamp':timestamp,
    'X-API-KEY':c.accessLicense,
    'X-Customer':c.customerId,
    'X-Signature':signature(timestamp,method,PATH,c.secretKey),
    'Content-Type':'application/json; charset=UTF-8'
  };
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),7000);
  let r;
  try{
    r=await fetch(url,{method,headers,signal:ctl.signal});
  }catch(e){
    if(e?.name==='AbortError'){
      const err=new Error('NAVER Search Ads request timeout after 7s');
      err.code='NAVER_AD_TIMEOUT';
      throw err;
    }
    throw e;
  }finally{
    clearTimeout(timer);
  }
  const text=await r.text();
  let json=null;try{json=JSON.parse(text);}catch(e){}
  if(!r.ok){
    const detail=json?.detail||json?.title||text.slice(0,300)||`HTTP ${r.status}`;
    const err=new Error(`NAVER Search Ads HTTP ${r.status}: ${detail}`);err.status=r.status;err.response=json||text;throw err;
  }
  const rows=Array.isArray(json?.keywordList)?json.keywordList:[];
  const normalized=String(keyword||'').replace(/\s+/g,'').toLowerCase();
  const exact=rows.find(x=>String(x.relKeyword||'').replace(/\s+/g,'').toLowerCase()===normalized)||rows[0]||null;
  if(!exact) return {keyword,found:false,rows:0,raw:null};
  const pc=numericSearchCount(exact.monthlyPcQcCnt),mobile=numericSearchCount(exact.monthlyMobileQcCnt);
  return {
    keyword,
    found:true,
    matchedKeyword:exact.relKeyword||keyword,
    monthlyPcQcCnt:pc,
    monthlyMobileQcCnt:mobile,
    monthlyTotalQcCnt:pc+mobile,
    rawMonthlyPcQcCnt:exact.monthlyPcQcCnt,
    rawMonthlyMobileQcCnt:exact.monthlyMobileQcCnt,
    compIdx:exact.compIdx??null,
    plAvgDepth:exact.plAvgDepth??null,
    monthlyAvePcClkCnt:exact.monthlyAvePcClkCnt??null,
    monthlyAveMobileClkCnt:exact.monthlyAveMobileClkCnt??null,
    monthlyAvePcCtr:exact.monthlyAvePcCtr??null,
    monthlyAveMobileCtr:exact.monthlyAveMobileCtr??null,
    rows:rows.length,
    fetchedAt:new Date().toISOString()
  };
}

async function queryKeywords(keywords=[]){
  const out=[];
  for(const keyword of keywords){
    try{out.push({ok:true,...await queryKeyword(keyword)});}catch(e){out.push({ok:false,keyword,error:e.message||String(e),status:e.status||null});}
    // Keep the probe gentle. Full 299-person collection will use its own queue later.
    await new Promise(r=>setTimeout(r,40));
  }
  return out;
}

module.exports={credentials,signature,queryKeyword,queryKeywords,numericSearchCount};
