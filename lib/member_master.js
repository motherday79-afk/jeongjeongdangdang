const store=require('./store');

const ENDPOINT='https://open.assembly.go.kr/portal/openapi/ALLNAMEMBER';
const CACHE_KEY='jjdd:member-master:v2';
const LAST_GOOD_KEY='jjdd:member-master:last-good:v2';
const CACHE_TTL=60*60*24*7;

function collectRows(node,out=[]){
  if(!node)return out;
  if(Array.isArray(node)){for(const v of node)collectRows(v,out);return out;}
  if(typeof node==='object'){
    const name=node.NAAS_NM||node.HG_NM||node.naasNm||node.hgNm;
    const code=node.NAAS_CD||node.MONA_CD||node.naasCd||node.monaCd;
    if(name&&code)out.push(node);
    for(const v of Object.values(node))if(v&&typeof v==='object')collectRows(v,out);
  }
  return out;
}
function clean(v){return String(v??'').trim();}
function photoUrl(pic,code){
  let u=clean(pic);
  if(u){
    if(u.startsWith('//'))u='https:'+u;
    else if(u.startsWith('/'))u='https://www.assembly.go.kr'+u;
    else if(!/^https?:/i.test(u))u='https://www.assembly.go.kr/'+u.replace(/^\/+/, '');
    return u.replace(/^http:/i,'https:');
  }
  const c=clean(code);
  return c?`https://www.assembly.go.kr/photo/${encodeURIComponent(c)}.jpg`:'';
}
function parseTerms(raw){
  const text=clean(raw);
  if(!text||!text.includes('대'))return [];
  const out=[];
  const re=/\d{1,2}/g; let m;
  while((m=re.exec(text))){const n=Number(m[0]);if(n>=1&&n<=22&&!out.includes(n))out.push(n);}
  return out.sort((a,b)=>a-b);
}
function termsLabel(terms,raw=''){
  const list=[...new Set((terms||[]).map(Number).filter(n=>n>=1&&n<=22))].sort((a,b)=>a-b);
  const count=list.length;
  if(count){
    const head=count===1?'초선':count===2?'재선':`${count}선`;
    return `${head} (${list.join('·')}대)`;
  }
  const t=clean(raw);
  const m=t.match(/(초선|재선|\d+선)/);
  return m?m[1]:'';
}
function normalize(row){
  const code=clean(row.NAAS_CD||row.MONA_CD||row.naasCd||row.monaCd);
  const name=clean(row.NAAS_NM||row.HG_NM||row.naasNm||row.hgNm);
  const rawTerms=clean(row.GTELT_ERACO||row.gteltEraco||row.REELE_GBN_NM||row.reeleGbnNm||'');
  const electedTerms=parseTerms(rawTerms);
  return {
    assemblyCode:code,
    name,
    party:clean(row.PLPT_NM||row.POLY_NM||row.plptNm||row.polyNm),
    constituency:clean(row.ELECD_NM||row.ORIG_NM||row.elecdNm||row.origNm),
    committee:clean(row.CMIT_NM||row.BLNG_CMIT_NM||row.cmitNm||row.blngCmitNm),
    officialPhoto:photoUrl(row.NAAS_PIC||row.naasPic,code),
    electedTerms,
    termCount:electedTerms.length||null,
    termsLabel:termsLabel(electedTerms,rawTerms),
    rawTerms,
    source:'대한민국 국회 · 열린국회정보 ALLNAMEMBER'
  };
}
function validMaster(x){
  return Boolean(x&&Array.isArray(x.members)&&x.members.length>=100&&x.members.filter(m=>m.officialPhoto).length>=100);
}
async function fetchOfficial(){
  const key=clean(process.env.ASSEMBLY_OPEN_API_KEY);
  const attempts=[];
  if(key)attempts.push(`${ENDPOINT}?KEY=${encodeURIComponent(key)}&Type=json&pIndex=1&pSize=400`);
  // v2.2.23: v2.2.15 브라우저 경로에서 실제 사용하던 sample/no-key 두 경로를 서버에도 동일하게 둡니다.
  attempts.push(`${ENDPOINT}?KEY=sample&Type=json&pIndex=1&pSize=400`);
  attempts.push(`${ENDPOINT}?Type=json&pIndex=1&pSize=400`);
  let lastError=null;
  for(const url of [...new Set(attempts)]){
    const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),9000);
    try{
      const r=await fetch(url,{headers:{'User-Agent':'JJDD-MemberIntegrity/2.0','Accept':'application/json,text/plain,*/*'},signal:ctl.signal});
      if(!r.ok)throw new Error(`Assembly HTTP ${r.status}`);
      const data=await r.json();
      const rows=collectRows(data,[]).map(normalize).filter(x=>x.name&&x.assemblyCode);
      const byKey=new Map();
      for(const x of rows)byKey.set(`${x.assemblyCode}|${x.name}`,x);
      const members=[...byKey.values()];
      const fresh={ok:true,updatedAt:new Date().toISOString(),members,verifiedCount:members.filter(x=>x.termsLabel).length,photoCount:members.filter(x=>x.officialPhoto).length,sourceUrl:url.replace(/KEY=[^&]+/,'KEY=***')};
      if(!validMaster(fresh))throw new Error(`Assembly rows/photos insufficient: rows=${members.length}, photos=${fresh.photoCount}`);
      return fresh;
    }catch(e){lastError=e;}finally{clearTimeout(timer);}
  }
  throw lastError||new Error('Assembly member master unavailable');
}
async function getMaster({force=false}={}){
  if(!force){
    try{const cached=await store.getJSON(CACHE_KEY);if(validMaster(cached))return {...cached,cached:true};}catch(_){}
  }
  try{
    const fresh=await fetchOfficial();
    await Promise.all([
      store.setJSON(CACHE_KEY,fresh,CACHE_TTL).catch(()=>{}),
      // last-known-good는 TTL을 두지 않습니다. 외부 국회 API가 잠시 죽어도 299명 사진이 함께 사라지면 안 됩니다.
      store.setJSON(LAST_GOOD_KEY,fresh).catch(()=>{})
    ]);
    return fresh;
  }catch(e){
    try{const lkg=await store.getJSON(LAST_GOOD_KEY);if(validMaster(lkg))return {...lkg,cached:true,lastKnownGood:true,fetchError:String(e?.message||e)};}catch(_){}
    throw e;
  }
}
module.exports={getMaster,fetchOfficial,normalize,parseTerms,termsLabel,validMaster,CACHE_KEY,LAST_GOOD_KEY};
