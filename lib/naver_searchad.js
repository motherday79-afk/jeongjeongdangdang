const crypto=require('crypto');

const BASE_URL='https://api.searchad.naver.com';
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

function searchScaleScore(monthlyTotal){
  // Fixed 0~100 scale for rolling monthly search demand.
  // ~1k => 26, 10k => 50, 100k => 75, 1m => 100.
  const n=Math.max(0,Number(monthlyTotal)||0);
  if(!n)return 0;
  return Math.round(Math.min(100,25*Math.log10(1+n/100))*10)/10;
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
  const timer=setTimeout(()=>ctl.abort(),5000);
  let r;
  try{
    r=await fetch(url,{method,headers,signal:ctl.signal});
  }catch(e){
    if(e?.name==='AbortError'){
      const err=new Error('NAVER Search Ads request timeout after 5s');
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
  const exact=rows.find(x=>String(x.relKeyword||'').replace(/\s+/g,'').toLowerCase()===normalized)||null;
  // 정상 응답 + 정확 의원명 미반환은 수집 실패가 아니라 ZERO 관측이다.
  if(!exact) return {keyword,found:false,rows:rows.length,raw:null,fetchedAt:new Date().toISOString()};
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

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function retryable(e){const st=Number(e?.status||0);return e?.code==='NAVER_AD_TIMEOUT'||st===429||st>=500;}
async function queryWithRetry(keyword,attempts=3){
  let last;
  for(let i=0;i<attempts;i++){
    try{return {ok:true,...await queryKeyword(keyword)};}
    catch(e){last=e;if(i>=attempts-1||!retryable(e))break;await sleep(300*Math.pow(2,i));}
  }
  return {ok:false,keyword,error:last?.message||String(last),status:last?.status||null};
}
async function queryKeywords(keywords=[],opts={}){
  const list=[...keywords],limit=Math.max(1,Math.min(4,Number(opts.concurrency)||3)),out=new Array(list.length);let cursor=0;
  async function worker(){while(true){const i=cursor++;if(i>=list.length)return;out[i]=await queryWithRetry(list[i],3);}}
  await Promise.all(Array.from({length:Math.min(limit,list.length)},worker));
  return out;
}

module.exports={credentials,signature,queryKeyword,queryKeywords,numericSearchCount,searchScaleScore};
