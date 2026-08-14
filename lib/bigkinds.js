const {mark,missing,STATES}=require('./observation');
const {disambiguationTerms}=require('./member_key');
const {searchQualifier}=require('./political_entity');
const SEARCH_URL='https://tools.kinds.or.kr/search/news';
const WORD_URL='https://tools.kinds.or.kr/word_cloud';
function credentials(){const accessKey=String(process.env.BIGKINDS_ACCESS_KEY||'').trim();return {configured:Boolean(accessKey),accessKey};}
function kstDate(d){return new Date(d.getTime()+9*3600000).toISOString().slice(0,10);}
function windowDates(days=7){const now=new Date();return {from:kstDate(new Date(now.getTime()-days*86400000)),until:kstDate(new Date(now.getTime()+86400000))};}
async function post(url,argument){
  const c=credentials();if(!c.configured)throw new Error('BIGKINDS_ACCESS_KEY not configured');
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),9000);let r;
  try{r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json; charset=UTF-8'},body:JSON.stringify({access_key:c.accessKey,argument}),signal:ctl.signal});}
  catch(e){if(e?.name==='AbortError')throw new Error('BIG KINDS timeout');throw e;}finally{clearTimeout(timer);}
  const text=await r.text();let j={};try{j=JSON.parse(text);}catch(e){}
  if(!r.ok)throw new Error(`BIG KINDS HTTP ${r.status}: ${j?.message||text.slice(0,180)}`);
  if(Number(j?.result||0)!==0)throw new Error(`BIG KINDS result ${j?.result}: ${j?.message||'API error'}`);
  return j?.return_object||{};
}
function queryForMember(member){return searchQualifier(member);}
async function searchMemberNews(member,days=7){
  const argument={query:queryForMember(member),published_at:windowDates(days),sort:[{date:'desc'}],hilight:120,return_from:0,return_size:50,fields:['title','published_at','dateline','enveloped_at','provider','category','category_incident','provider_link_page','tms_raw_stream']};
  const ro=await post(SEARCH_URL,argument),docs=Array.isArray(ro.documents)?ro.documents:[],now=Date.now();
  const items=docs.map(d=>{const ts=Date.parse(d.dateline||d.enveloped_at||d.published_at||'');return {title:String(d.title||'').trim(),source:String(d.provider||'').trim(),ts:Number.isFinite(ts)?ts:null,link:String(d.provider_link_page||''),incidents:Array.isArray(d.category_incident)?d.category_incident:[]};}).filter(x=>x.title);
  const timed=items.filter(x=>Number.isFinite(x.ts)),within=h=>timed.filter(x=>now-x.ts>=0&&now-x.ts<=h*3600000),h6=within(6),h24=within(24),h7=within(168);
  return {provider:'bigkinds-news',count6:h6.length,count24:h24.length,count7d:h7.length||items.length,sources6:new Set(h6.map(x=>x.source).filter(Boolean)).size,sources24:new Set(h24.map(x=>x.source).filter(Boolean)).size,totalCount:Number(ro.total_hits||docs.length),latest:timed.length?Math.max(...timed.map(x=>x.ts)):null,headlines:items.slice(0,12).map(x=>({title:x.title,source:x.source,ts:x.ts,link:x.link,channel:'bigkinds'})),incidents:[...new Set(items.flatMap(x=>x.incidents).filter(Boolean))].slice(0,12)};
}
async function relatedWords(member,days=7){
  const argument={query:queryForMember(member),published_at:windowDates(days),provider:[],category:[],category_incident:[],byline:'',provider_subject:[]};
  const ro=await post(WORD_URL,argument),nodes=Array.isArray(ro.nodes)?ro.nodes:[];
  return nodes.map(x=>({name:String(x.name||'').trim(),weight:Number(x.weight||0),level:Number(x.level||0)})).filter(x=>x.name&&x.name!==member.name).sort((a,b)=>b.weight-a.weight).slice(0,20);
}
async function collectBigKinds(member){
  if(!credentials().configured)return missing('bigkinds','BIGKINDS_ACCESS_KEY not configured');
  try{const [news,words]=await Promise.all([searchMemberNews(member,7),relatedWords(member,7)]);return mark({...news,relatedWords:words},'bigkinds',(Number(news.count7d||0)>0||words.length)?STATES.OBSERVED:STATES.ZERO);}
  catch(e){return missing('bigkinds',e.message||String(e));}
}
module.exports={credentials,collectBigKinds,searchMemberNews,relatedWords};
