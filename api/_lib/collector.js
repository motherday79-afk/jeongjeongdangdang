const {URL}=require('url');

function cleanHtml(s=''){
  return String(s).replace(/<[^>]+>/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
}
function sourceDomain(link=''){
  try{return new URL(link).hostname.replace(/^www\./,'')}catch(e){return ''}
}
function normalizeTitle(s=''){
  return cleanHtml(s).toLowerCase()
    .replace(/\[[^\]]+\]/g,' ')
    .replace(/\([^)]*연합뉴스[^)]*\)/g,' ')
    .replace(/[^0-9a-z가-힣]+/g,' ')
    .replace(/\s+/g,' ').trim();
}
function dedupe(items){
  const seen=new Set(),out=[];
  for(const x of items){
    const key=normalizeTitle(x.title);
    if(!key||seen.has(key)) continue;
    seen.add(key); out.push(x);
  }
  return out;
}
function parseNaverItems(j){
  return (j.items||[]).map(x=>({
    title:cleanHtml(x.title),
    desc:cleanHtml(x.description),
    link:x.originallink||x.link||'',
    source:sourceDomain(x.originallink||x.link||''),
    ts:Date.parse(x.pubDate||'')
  })).filter(x=>Number.isFinite(x.ts));
}
function xmlText(block,tag){
  const m=block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,'i'));
  return m?cleanHtml(m[1]):'';
}
function parseGoogleRss(xml){
  const blocks=String(xml).match(/<item>[\s\S]*?<\/item>/gi)||[];
  return blocks.map(b=>{
    const title=xmlText(b,'title');
    const link=xmlText(b,'link');
    const pubDate=xmlText(b,'pubDate');
    const source=xmlText(b,'source')||sourceDomain(link);
    return {title,desc:'',link,source,ts:Date.parse(pubDate)};
  }).filter(x=>Number.isFinite(x.ts));
}
async function fetchNaver(member){
  const id=process.env.NAVER_API_HUB_CLIENT_ID;
  const secret=process.env.NAVER_API_HUB_CLIENT_SECRET;
  if(!id||!secret) return null;
  const query=`${member.name} 국회의원`;
  const url=`https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent(query)}&display=100&sort=date`;
  const r=await fetch(url,{headers:{
    'X-NCP-APIGW-API-KEY-ID':id,
    'X-NCP-APIGW-API-KEY':secret
  }});
  if(!r.ok) throw new Error(`NAVER ${r.status}`);
  return parseNaverItems(await r.json());
}
async function fetchGoogle(member){
  const query=`"${member.name}" 국회의원 when:7d`;
  const url=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 jjdd-nowrank/1.3'}});
  if(!r.ok) throw new Error(`Google News ${r.status}`);
  return parseGoogleRss(await r.text());
}
function itemMentionsMember(item,name){
  const t=`${item.title} ${item.desc||''}`;
  return t.includes(name);
}
function itemMatchesEvent(item,keywords=[]){
  if(!keywords.length) return false;
  const t=`${item.title} ${item.desc||''}`.toLowerCase();
  return keywords.some(k=>k && t.includes(String(k).toLowerCase()));
}
function summarize(items,member,keywords,nowMs){
  const arr=dedupe(items).filter(x=>itemMentionsMember(x,member.name));
  const h=ms=>ms*3600000;
  const recent7=arr.filter(x=>nowMs-x.ts<=h(168) && nowMs>=x.ts);
  const recent24=recent7.filter(x=>nowMs-x.ts<=h(24));
  const recent6=recent24.filter(x=>nowMs-x.ts<=h(6));
  const sources6=new Set(recent6.map(x=>x.source).filter(Boolean));
  const sources24=new Set(recent24.map(x=>x.source).filter(Boolean));
  const event6=recent6.filter(x=>itemMatchesEvent(x,keywords));
  const latest=recent7.length?Math.max(...recent7.map(x=>x.ts)):null;
  return {
    count6:recent6.length,count24:recent24.length,count7d:recent7.length,
    sources6:sources6.size,sources24:sources24.size,
    event6:event6.length,latest,
    headlines:recent6.slice(0,5).map(x=>({title:x.title,source:x.source,ts:x.ts,link:x.link}))
  };
}
async function collectMember(member,keywords=[]){
  const nowMs=Date.now();
  let source='google-news-rss',items=[],warning=null;
  try{
    const n=await fetchNaver(member);
    if(n){items=n;source='naver-api-hub-news';}
    else items=await fetchGoogle(member);
  }catch(e){
    warning=String(e.message||e);
    try{items=await fetchGoogle(member);source='google-news-rss-fallback';}
    catch(e2){return {...summarize([],member,keywords,nowMs),source:'unavailable',warning:`${warning}; ${e2.message||e2}`};}
  }
  return {...summarize(items,member,keywords,nowMs),source,warning};
}
module.exports={collectMember,cleanHtml,parseNaverItems,parseGoogleRss,summarize};
