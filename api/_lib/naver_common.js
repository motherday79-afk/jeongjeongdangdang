const {mark,missing,STATES}=require('./observation');

function firstEnv(...names){for(const n of names){const v=process.env[n];if(v&&String(v).trim())return {name:n,value:String(v).trim()};}return null;}
function creds(){
  const hubId=firstEnv('NAVER_API_HUB_CLIENT_ID','NCP_NAVER_API_HUB_CLIENT_ID'),hubSecret=firstEnv('NAVER_API_HUB_CLIENT_SECRET','NCP_NAVER_API_HUB_CLIENT_SECRET');
  if(hubId&&hubSecret)return {mode:'hub',id:hubId.value,secret:hubSecret.value,idEnv:hubId.name,secretEnv:hubSecret.name,base:'https://naverapihub.apigw.ntruss.com',headers:{'X-NCP-APIGW-API-KEY-ID':hubId.value,'X-NCP-APIGW-API-KEY':hubSecret.value}};
  const legacyId=firstEnv('NAVER_CLIENT_ID','NAVER_DEVELOPERS_CLIENT_ID'),legacySecret=firstEnv('NAVER_CLIENT_SECRET','NAVER_DEVELOPERS_CLIENT_SECRET');
  if(legacyId&&legacySecret)return {mode:'legacy',id:legacyId.value,secret:legacySecret.value,idEnv:legacyId.name,secretEnv:legacySecret.name,base:'https://openapi.naver.com',headers:{'X-Naver-Client-Id':legacyId.value,'X-Naver-Client-Secret':legacySecret.value}};
  return null;
}
function credentialStatus(){
  const c=creds();
  if(c)return {configured:true,mode:c.mode,idEnv:c.idEnv,secretEnv:c.secretEnv};
  const seen={hubId:Boolean(firstEnv('NAVER_API_HUB_CLIENT_ID','NCP_NAVER_API_HUB_CLIENT_ID')),hubSecret:Boolean(firstEnv('NAVER_API_HUB_CLIENT_SECRET','NCP_NAVER_API_HUB_CLIENT_SECRET')),legacyId:Boolean(firstEnv('NAVER_CLIENT_ID','NAVER_DEVELOPERS_CLIENT_ID')),legacySecret:Boolean(firstEnv('NAVER_CLIENT_SECRET','NAVER_DEVELOPERS_CLIENT_SECRET'))};
  return {configured:false,mode:'none',seen,detail:'NAVER credential pair not found. Set NAVER_API_HUB_CLIENT_ID + NAVER_API_HUB_CLIENT_SECRET (recommended) or legacy NAVER_CLIENT_ID + NAVER_CLIENT_SECRET.'};
}
function clean(s=''){return String(s).replace(/<[^>]+>/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();}
function unique(xs){return [...new Set(xs.map(x=>String(x||'').trim()).filter(Boolean))];}
function memberKeywords(member){
  const name=member.name,party=member.party&&member.party!=='공석'?member.party:'',region=member.region||'',constituency=member.constituency||'';
  return unique([name,`${name} 의원`,`${name} 국회의원`,party&&`${name} ${party}`,region&&`${name} ${region}`,constituency&&`${name} ${constituency}`]).slice(0,20);
}
function politicalContext(member,text=''){
  const t=clean(text),name=member.name;if(!t.includes(name))return false;
  const context=['국회','국회의원','의원','정치','정당','대표','최고위원','위원장','원내','정부','대통령','장관','선거','공천','당대표','국감','본회의','법안','의정'];
  if(member.party&&member.party!=='무소속'&&member.party!=='공석')context.push(member.party);
  if(member.region)context.push(member.region);
  const c=String(member.constituency||'').replace(/^\S+\s+/,'').replace(/구[갑을병정]$/,'구');if(c.length>=2)context.push(c);
  return context.some(k=>k&&t.includes(k)) || (String(text).split(name).length-1>=2);
}
function parseDate8(s=''){const m=String(s).match(/^(\d{4})(\d{2})(\d{2})$/);if(!m)return null;return Date.parse(`${m[1]}-${m[2]}-${m[3]}T03:00:00Z`);}
function searchPath(type,mode){
  const hub={news:'/search/v1/news',blog:'/search/v1/blog',cafe:'/search/v1/cafearticle',web:'/search/v1/webkr'};
  const legacy={news:'/v1/search/news.json',blog:'/v1/search/blog.json',cafe:'/v1/search/cafearticle.json',web:'/v1/search/webkr.json'};
  return (mode==='legacy'?legacy:hub)[type];
}
async function requestJson(url,options={},label='NAVER'){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),Number(options.timeout||9000));
  try{
    const r=await fetch(url,{...options,signal:ctl.signal});const text=await r.text();
    if(!r.ok){const msg=clean(text).slice(0,180);throw new Error(`${label} HTTP ${r.status}${msg?` · ${msg}`:''}`);}
    try{return JSON.parse(text)}catch(e){throw new Error(`${label} invalid-json`);}
  }catch(e){if(e?.name==='AbortError')throw new Error(`${label} timeout`);throw e;}finally{clearTimeout(timer);}
}
async function callSearch(type,params={}){
  const c=creds();if(!c)throw new Error(credentialStatus().detail);
  const qs=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')qs.set(k,String(v));
  const path=searchPath(type,c.mode),url=`${c.base}${path}?${qs}`;
  return requestJson(url,{headers:c.headers},`NAVER ${c.mode} ${type}`);
}
async function callTrend(body){
  const c=creds();if(!c)throw new Error(credentialStatus().detail);
  const path=c.mode==='legacy'?'/v1/datalab/search':'/search-trend/v1/search';
  return requestJson(`${c.base}${path}`,{method:'POST',headers:{...c.headers,'Content-Type':'application/json'},body:JSON.stringify(body)},`NAVER ${c.mode} trend`);
}
function surfaceFromSearch(j,member,type,keywords=[]){
  const rows=(j.items||[]).map(x=>({title:clean(x.title||''),desc:clean(x.description||''),link:x.originallink||x.link||'',source:clean(x.bloggername||x.cafename||''),ts:type==='blog'?parseDate8(x.postdate):null})).filter(x=>politicalContext(member,`${x.title} ${x.desc}`));
  const now=Date.now(),normK=keywords.map(k=>clean(k).toLowerCase()).filter(Boolean),eventHits=rows.filter(x=>normK.some(k=>`${x.title} ${x.desc}`.toLowerCase().includes(k))).length,freshHits=rows.filter(x=>Number.isFinite(x.ts)&&now-x.ts<=36*3600000).length;
  return mark({provider:`naver-${type}-api`,surfaceHits:rows.length,nameHits:rows.length,eventHits,freshHits,latest:rows.map(x=>x.ts).filter(Number.isFinite).sort((a,b)=>b-a)[0]||null,totalCount:Number(j.total||0),headlines:rows.slice(0,8).map(x=>({title:x.title,source:x.source||`NAVER ${type}`,ts:x.ts||now,link:x.link,channel:`naver-${type}-api`}))},`naver-${type}-api`,rows.length?STATES.OBSERVED:STATES.ZERO,`auth=${creds()?.mode||'none'}`);
}
async function collectSearchSurfaces(member,keywords=[]){
  const c=creds();if(!c){const d=credentialStatus().detail;return {naverBlogApi:missing('naver-blog-api',d,'surface'),naverCafeApi:missing('naver-cafe-api',d,'surface'),naverWebApi:missing('naver-web-api',d,'surface')};}
  const specs=[['blog',{sort:'date'}],['cafe',{sort:'date'}],['web',{}]];
  const settled=await Promise.all(specs.map(async ([type,extra])=>{try{const j=await callSearch(type,{query:member.name,display:100,...extra});return [type,surfaceFromSearch(j,member,type,keywords)];}catch(e){return [type,missing(`naver-${type}-api`,e.message||String(e),'surface')];}}));
  const out={};for(const [type,s] of settled)out[type==='blog'?'naverBlogApi':type==='cafe'?'naverCafeApi':'naverWebApi']=s;return out;
}
async function collectNewsItems(member){
  const c=creds();if(!c)return {items:null,error:credentialStatus().detail,mode:'none'};
  try{const j=await callSearch('news',{query:member.name,display:100,sort:'date'});return {items:j.items||[],error:null,mode:c.mode};}catch(e){return {items:null,error:e.message||String(e),mode:c.mode};}
}
function kstDate(ms=Date.now()){return new Date(ms+9*3600000).toISOString().slice(0,10);}
function avg(xs){const a=xs.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function clamp(x,a=0,b=100){return Math.max(a,Math.min(b,x));}
function trendSummary(result,anchorResult,member,anchorName){
  const amap=new Map((anchorResult?.data||[]).map(x=>[x.period,Number(x.ratio||0)]));
  const series=(result?.data||[]).map(x=>{const a=amap.get(x.period)||0,r=Number(x.ratio||0);return {period:x.period,ratio:r,anchorRatio:a,index:a>0?100*r/a:null};}).filter(x=>Number.isFinite(x.index));
  if(member.name===anchorName){for(const x of series)x.index=x.anchorRatio>0?100:0;}
  const vals=series.map(x=>x.index),last7=vals.slice(-7),last30=vals.slice(-30),recent3=avg(vals.slice(-3)),prior14=avg(vals.slice(-17,-3)),level7d=avg(last7),level30d=avg(last30),momentum=(recent3+3)/(prior14+3),levelScore=100*(1-Math.exp(-Math.max(0,level7d)/58)),surgeScore=clamp(50+32*Math.log2(Math.max(.25,momentum))),has=vals.some(v=>v>0),score=has?clamp(.68*levelScore+.32*surgeScore):0;
  return mark({provider:'naver-search-trend',score,level7d,level30d,recent3,prior14,momentum,anchorName,series:series.slice(-7),latest:series.length?Date.parse(`${series.at(-1).period}T03:00:00Z`):null,totalCount:null},'naver-search-trend',has?STATES.OBSERVED:STATES.ZERO,`auth=${creds()?.mode||'none'} · calibrated against ${anchorName}`);
}
async function collectTrendBatch(members=[],anchorMember){
  const c=creds();if(!c){const out={};for(const m of members)out[m.name]=missing('naver-search-trend',credentialStatus().detail);return {signals:out,configured:false,mode:'none',error:'credentials-missing'};}
  const uniq=new Map([[anchorMember.name,anchorMember]]);for(const m of members)uniq.set(m.name,m);
  const groups=[...uniq.values()].slice(0,5).map(m=>({groupName:m.name,keywords:memberKeywords(m)})),endDate=kstDate(),startDate=kstDate(Date.now()-34*86400000),payload={startDate,endDate,timeUnit:'date',keywordGroups:groups};
  let j;try{j=await callTrend(payload);}catch(e){const out={};for(const m of members)out[m.name]=missing('naver-search-trend',e.message||String(e));return {signals:out,configured:true,mode:c.mode,error:e.message||String(e),period:{startDate,endDate}};}
  const byTitle=new Map((j.results||[]).map(x=>[x.title,x])),anchor=byTitle.get(anchorMember.name),out={};
  for(const m of members){const result=byTitle.get(m.name);out[m.name]=result&&anchor?trendSummary(result,anchor,m,anchorMember.name):missing('naver-search-trend',`NAVER ${c.mode} trend response missing ${!anchor?'anchor':m.name}`);}
  if(!out[anchorMember.name]&&anchor)out[anchorMember.name]=trendSummary(anchor,anchor,anchorMember,anchorMember.name);
  return {signals:out,configured:true,mode:c.mode,anchorName:anchorMember.name,period:{startDate,endDate}};
}
async function probe(){
  const st=credentialStatus();if(!st.configured)return {...st,search:{ok:false,detail:st.detail},trend:{ok:false,detail:st.detail}};
  const out={...st};
  try{const j=await callSearch('news',{query:'국회',display:1,sort:'date'});out.search={ok:true,total:Number(j.total||0)};}catch(e){out.search={ok:false,detail:e.message||String(e)};}
  try{const endDate=kstDate(),startDate=kstDate(Date.now()-7*86400000),j=await callTrend({startDate,endDate,timeUnit:'date',keywordGroups:[{groupName:'probe',keywords:['국회']} ]});out.trend={ok:Array.isArray(j.results),groups:Array.isArray(j.results)?j.results.length:0};if(!out.trend.ok)out.trend.detail='results array missing';}catch(e){out.trend={ok:false,detail:e.message||String(e)};}
  return out;
}
module.exports={creds,credentialStatus,memberKeywords,politicalContext,collectSearchSurfaces,collectTrendBatch,collectNewsItems,probe,callSearch,callTrend,mark,missing,STATES};
