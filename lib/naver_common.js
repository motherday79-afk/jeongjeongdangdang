const {mark,missing,STATES}=require('./observation');
const {memberKey,disambiguationTerms}=require('./member_key');
const {roleAliases,contextTerms,searchQualifier}=require('./political_entity');

function creds(){
  const id=process.env.NAVER_API_HUB_CLIENT_ID,secret=process.env.NAVER_API_HUB_CLIENT_SECRET;
  return id&&secret?{id,secret}:null;
}
function clean(s=''){return String(s).replace(/<[^>]+>/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();}
function unique(xs){return [...new Set(xs.map(x=>String(x||'').trim()).filter(Boolean))];}
function memberKeywords(member){
  const name=member.name,party=member.party&&member.party!=='공석'?member.party:'',region=member.region||'',constituency=member.constituency||'',jurisdiction=member.jurisdiction||'';
  const roles=roleAliases(member).map(r=>`${name} ${r}`);
  return unique([name,...roles,party&&`${name} ${party}`,region&&`${name} ${region}`,jurisdiction&&`${name} ${jurisdiction}`,constituency&&`${name} ${constituency}`]).slice(0,12);
}
function politicalContext(member,text=''){
  const t=clean(text),name=member.name;if(!t.includes(name))return false;
  const clues=disambiguationTerms(member);
  // 동명이인은 이름만으로 귀속하지 않습니다. 지역구·경력 등 최소 1개 식별 단서가
  // 함께 있는 기사만 해당 의원의 데이터로 인정해 서로 다른 인물의 신호가 섞이지 않게 합니다.
  if(member.ambiguousName){
    return clues.some(k=>k&&t.includes(k));
  }
  const context=contextTerms(member);
  return context.some(k=>k&&t.includes(k)) || (String(text).split(name).length-1>=2);
}
function parseDate8(s=''){
  const m=String(s).match(/^(\d{4})(\d{2})(\d{2})$/);if(!m)return null;
  return Date.parse(`${m[1]}-${m[2]}-${m[3]}T03:00:00Z`);
}
async function call(path,params={}){
  const c=creds();if(!c)throw new Error('NAVER_API_HUB_UNCONFIGURED');
  const qs=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')qs.set(k,String(v));
  const r=await fetch(`https://naverapihub.apigw.ntruss.com${path}?${qs}`,{headers:{'X-NCP-APIGW-API-KEY-ID':c.id,'X-NCP-APIGW-API-KEY':c.secret}});
  const text=await r.text();if(!r.ok)throw new Error(`NAVER ${path} ${r.status} ${text.slice(0,120)}`);
  try{return JSON.parse(text)}catch(e){throw new Error(`NAVER ${path} invalid-json`);}
}
function surfaceFromSearch(j,member,type,keywords=[]){
  const rows=(j.items||[]).map(x=>({
    title:clean(x.title||''),desc:clean(x.description||''),link:x.originallink||x.link||'',source:clean(x.bloggername||x.cafename||''),
    ts:type==='blog'?parseDate8(x.postdate):null
  })).filter(x=>politicalContext(member,`${x.title} ${x.desc}`));
  const now=Date.now(),normK=keywords.map(k=>clean(k).toLowerCase()).filter(Boolean);
  const eventHits=rows.filter(x=>normK.some(k=>`${x.title} ${x.desc}`.toLowerCase().includes(k))).length;
  const freshHits=rows.filter(x=>Number.isFinite(x.ts)&&now-x.ts<=36*3600000).length;
  return mark({provider:`naver-${type}-api`,surfaceHits:rows.length,nameHits:rows.length,eventHits,freshHits,latest:rows.map(x=>x.ts).filter(Number.isFinite).sort((a,b)=>b-a)[0]||null,totalCount:Number(j.total||0),headlines:rows.slice(0,8).map(x=>({title:x.title,source:x.source||`NAVER ${type}`,ts:x.ts||now,link:x.link,channel:`naver-${type}-api`}))},`naver-${type}-api`,rows.length?STATES.OBSERVED:STATES.ZERO);
}
async function collectSearchSurfaces(member,keywords=[]){
  if(!creds())return {naverBlogApi:missing('naver-blog-api','NAVER API HUB credentials not configured','surface'),naverCafeApi:missing('naver-cafe-api','NAVER API HUB credentials not configured','surface'),naverWebApi:missing('naver-web-api','NAVER API HUB credentials not configured','surface')};
  const specs=[['blog','/search/v1/blog',{sort:'date'}],['cafe','/search/v1/cafearticle',{sort:'date'}],['web','/search/v1/webkr',{}]];
  const settled=await Promise.all(specs.map(async ([type,path,extra])=>{try{const j=await call(path,{query:['metro','local'].includes(String(member.entityType||'assembly'))?searchQualifier(member):member.name,display:100,...extra});return [type,surfaceFromSearch(j,member,type,keywords)];}catch(e){return [type,missing(`naver-${type}-api`,e.message||String(e),'surface')];}}));
  const out={};for(const [type,s] of settled)out[type==='blog'?'naverBlogApi':type==='cafe'?'naverCafeApi':'naverWebApi']=s;return out;
}
function kstDate(ms=Date.now()){return new Date(ms+9*3600000).toISOString().slice(0,10);}
function avg(xs){const a=xs.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function clamp(x,a=0,b=100){return Math.max(a,Math.min(b,x));}
function trendSummary(result,anchorResult,member,anchorName){
  const amap=new Map((anchorResult?.data||[]).map(x=>[x.period,Number(x.ratio||0)]));
  const series=(result?.data||[]).map(x=>{const a=amap.get(x.period)||0,r=Number(x.ratio||0);return {period:x.period,ratio:r,anchorRatio:a,index:a>0?100*r/a:null};}).filter(x=>Number.isFinite(x.index));
  if(member.name===anchorName){for(const x of series)x.index=x.anchorRatio>0?100:0;}
  const vals=series.map(x=>x.index),last7=vals.slice(-7),last30=vals.slice(-30),recent3=avg(vals.slice(-3)),prior14=avg(vals.slice(-17,-3));
  const level7d=avg(last7),level30d=avg(last30),momentum=(recent3+3)/(prior14+3);
  const levelScore=100*(1-Math.exp(-Math.max(0,level7d)/58));
  const surgeScore=clamp(50+32*Math.log2(Math.max(.25,momentum)));
  const has=vals.some(v=>v>0),score=has?clamp(.68*levelScore+.32*surgeScore):0;
  return mark({provider:'naver-search-trend',score,level7d,level30d,recent3,prior14,momentum,anchorName,series:series.slice(-7),latest:series.length?Date.parse(`${series.at(-1).period}T03:00:00Z`):null,totalCount:null},'naver-search-trend',has?STATES.OBSERVED:STATES.ZERO,`calibrated against ${anchorName}`);
}
async function collectTrendBatch(members=[],anchorMember){
  if(!creds()){const out={};for(const m of members)out[memberKey(m)]=missing('naver-search-trend','NAVER API HUB credentials not configured');return {signals:out,configured:false};}
  const uniq=new Map([[memberKey(anchorMember),anchorMember]]);for(const m of members)uniq.set(memberKey(m),m);
  const groups=[...uniq.values()].slice(0,5).map(m=>({groupName:memberKey(m),keywords:memberKeywords(m)}));
  const endDate=kstDate(),startDate=kstDate(Date.now()-34*86400000);
  const c=creds(),r=await fetch('https://naverapihub.apigw.ntruss.com/search-trend/v1/search',{method:'POST',headers:{'X-NCP-APIGW-API-KEY-ID':c.id,'X-NCP-APIGW-API-KEY':c.secret,'Content-Type':'application/json'},body:JSON.stringify({startDate,endDate,timeUnit:'date',keywordGroups:groups})});
  const text=await r.text();if(!r.ok){const out={};for(const m of members)out[memberKey(m)]=missing('naver-search-trend',`NAVER trend ${r.status} ${text.slice(0,120)}`);return {signals:out,configured:true,error:`${r.status}`};}
  let j;try{j=JSON.parse(text)}catch(e){const out={};for(const m of members)out[memberKey(m)]=missing('naver-search-trend','invalid-json');return {signals:out,configured:true,error:'invalid-json'};}
  const byTitle=new Map((j.results||[]).map(x=>[x.title,x])),anchor=byTitle.get(memberKey(anchorMember));const out={};
  for(const m of members){const k=memberKey(m),result=byTitle.get(k);out[k]=result&&anchor?trendSummary(result,anchor,m,anchorMember.name):missing('naver-search-trend','member or anchor result missing');}
  if(!out[memberKey(anchorMember)]&&anchor)out[memberKey(anchorMember)]=trendSummary(anchor,anchor,anchorMember,anchorMember.name);
  return {signals:out,configured:true,anchorName:anchorMember.name,period:{startDate,endDate}};
}
module.exports={creds,memberKeywords,politicalContext,collectSearchSurfaces,collectTrendBatch,mark,missing,STATES};
