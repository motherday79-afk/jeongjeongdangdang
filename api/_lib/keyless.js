const {URL}=require('url');

const UA='JJDD-NowRank/1.5 (+https://v11-lime.vercel.app/)';
const robotsCache=new Map();

function cleanHtml(s=''){
  return String(s).replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#39;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
    .replace(/\s+/g,' ').trim();
}
function escRe(s=''){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function normalize(s=''){return cleanHtml(s).toLowerCase().replace(/[^0-9a-z가-힣]+/g,' ').replace(/\s+/g,' ').trim();}
function parseCompactTraffic(s=''){
  const t=String(s).replace(/,/g,'').trim().toUpperCase();
  const m=t.match(/([0-9]+(?:\.[0-9]+)?)\s*([KMB만천]?)\+?/i);if(!m)return 0;
  const n=Number(m[1]);let mult=1;
  if(m[2]==='K'||m[2]==='천')mult=1e3;else if(m[2]==='M')mult=1e6;else if(m[2]==='B')mult=1e9;else if(m[2]==='만')mult=1e4;
  return Math.round(n*mult);
}
async function fetchText(url,{timeout=7000,headers={}}={}){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
  try{
    const r=await fetch(url,{redirect:'follow',signal:ctl.signal,headers:{'User-Agent':UA,'Accept-Language':'ko-KR,ko;q=0.9,en;q=0.5','Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',...headers}});
    return {ok:r.ok,status:r.status,url:r.url,text:await r.text(),type:r.headers.get('content-type')||''};
  }finally{clearTimeout(timer);}
}
function robotsGroups(txt=''){
  const groups=[];let agents=[],rules=[];
  const flush=()=>{if(agents.length)groups.push({agents:[...agents],rules:[...rules]});agents=[];rules=[];};
  for(const raw of String(txt).split(/\r?\n/)){
    const line=raw.replace(/#.*$/,'').trim();if(!line)continue;
    const i=line.indexOf(':');if(i<0)continue;
    const k=line.slice(0,i).trim().toLowerCase(),v=line.slice(i+1).trim();
    if(k==='user-agent'){
      if(rules.length)flush();agents.push(v.toLowerCase());
    }else if((k==='allow'||k==='disallow')&&agents.length)rules.push({kind:k,path:v});
  }
  flush();return groups;
}
function robotsAllows(txt,path,ua='jjdd-nowrank'){
  const groups=robotsGroups(txt),low=ua.toLowerCase();
  let candidates=groups.filter(g=>g.agents.some(a=>a==='*'||low.includes(a)||a.includes('jjdd')));
  const specific=candidates.filter(g=>g.agents.some(a=>a!=='*'&&(low.includes(a)||a.includes('jjdd'))));if(specific.length)candidates=specific;
  const rules=candidates.flatMap(g=>g.rules).filter(r=>r.path!==undefined);
  let best=null;
  for(const r of rules){if(!r.path)continue;if(path.startsWith(r.path)&&(!best||r.path.length>best.path.length))best=r;}
  return !best||best.kind==='allow';
}
async function checkRobots(origin,path){
  const key=origin;let rec=robotsCache.get(key);
  if(!rec){
    try{
      const r=await fetchText(`${origin}/robots.txt`,{timeout:5000,headers:{Accept:'text/plain,*/*;q=0.5'}});
      if(r.status===404||r.status===410)rec={state:'ALLOW_NO_ROBOTS',text:''};
      else if(r.status>=500)rec={state:'ROBOTS_SERVER_ERROR',text:null};
      else if(r.ok)rec={state:'ROBOTS_OK',text:r.text};
      else rec={state:'ROBOTS_UNKNOWN',text:null,status:r.status};
    }catch(e){rec={state:'ROBOTS_UNREACHABLE',text:null,error:e.message||String(e)};}
    robotsCache.set(key,rec);
  }
  const allowed=rec.text===null?false:(rec.text===''?true:robotsAllows(rec.text,path));
  return {...rec,allowed,path};
}
function relativeFreshHints(text=''){
  const t=cleanHtml(text);let n=0;
  n+=(t.match(/\b\d+\s*분\s*전\b/g)||[]).length;
  n+=(t.match(/\b\d+\s*시간\s*전\b/g)||[]).length;
  n+=(t.match(/오늘\s+오[전후]\s*\d{1,2}:\d{2}/g)||[]).length;
  return n;
}
function extractLinks(html='',name=''){
  const out=[];const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(html))&&out.length<80){const text=cleanHtml(m[2]);if(!text||!text.includes(name))continue;out.push({link:m[1],title:text});}
  return out;
}
function surfaceSummary(html,member,keywords=[],provider='surface'){
  const text=cleanHtml(html),norm=normalize(text),name=member.name;
  const nameHits=(text.match(new RegExp(escRe(name),'g'))||[]).length;
  const eventHits=keywords.reduce((a,k)=>{const nk=normalize(k);return a+(nk&&norm.includes(nk)?1:0)},0);
  const freshHints=relativeFreshHints(html);
  const links=extractLinks(html,name);
  const resultHits=Math.min(80,Math.max(links.length,Math.round(nameHits/2)));
  return {provider,surfaceHits:resultHits,nameHits,eventHits,freshHits:Math.min(resultHits,freshHints),latest:freshHints?Date.now():null,totalCount:null,headlines:links.slice(0,8).map(x=>({...x,source:provider,ts:Date.now(),channel:provider}))};
}
async function scrapeSearchPage(member,keywords,kind,permission){
  const cfg=kind==='naver'
    ?{origin:'https://search.naver.com',path:'/search.naver',url:`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(member.name+' 국회의원')}`}
    :{origin:'https://search.daum.net',path:'/search',url:`https://search.daum.net/search?w=tot&q=${encodeURIComponent(member.name+' 국회의원')}`};
  const p=permission||await checkRobots(cfg.origin,cfg.path);
  if(!p.allowed)return {summary:null,health:{state:p.state==='ROBOTS_OK'?'ROBOTS_BLOCKED':'ROBOTS_UNAVAILABLE',provider:`${kind}-html`,detail:p.state}};
  try{
    const r=await fetchText(cfg.url,{timeout:7000});
    if(r.status===403||r.status===429)return {summary:null,health:{state:'BLOCKED',provider:`${kind}-html`,status:r.status}};
    if(!r.ok)return {summary:null,health:{state:'ERROR',provider:`${kind}-html`,status:r.status}};
    const botLike=/captcha|비정상적인 접근|자동입력 방지|unusual traffic|접근이 제한/i.test(r.text);
    if(botLike)return {summary:null,health:{state:'BLOCKED',provider:`${kind}-html`,detail:'challenge-page'}};
    return {summary:surfaceSummary(r.text,member,keywords,`${kind}-html`),health:{state:'OK',provider:`${kind}-html`,status:r.status}};
  }catch(e){return {summary:null,health:{state:'ERROR',provider:`${kind}-html`,detail:e.message||String(e)}};}
}
function xmlTag(block,tag){
  const m=block.match(new RegExp(`<${tag.replace(':','\\:')}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag.replace(':','\\:')}>`,'i'));
  return m?cleanHtml(m[1]):'';
}
function parseTrendsRss(xml=''){
  const blocks=String(xml).match(/<item>[\s\S]*?<\/item>/gi)||[];
  return blocks.map(b=>{
    const title=xmlTag(b,'title'),traffic=xmlTag(b,'ht:approx_traffic')||xmlTag(b,'approx_traffic');
    const pub=xmlTag(b,'pubDate');
    const all=cleanHtml(b),related=[];
    const qr=/<(?:ht:news_item_title|ht:news_item_snippet|ht:picture_source|ht:news_item_url)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\//gi;let m;
    while((m=qr.exec(b))&&related.length<30)related.push(cleanHtml(m[1]));
    return {title,traffic:parseCompactTraffic(traffic),pubTs:Date.parse(pub||''),text:normalize([title,...related,all].join(' '))};
  }).filter(x=>x.title);
}
async function fetchGoogleTrendsKR(){
  const urls=['https://trends.google.com/trending/rss?geo=KR','https://trends.google.com/trending?geo=KR&hl=ko'];
  for(const url of urls){
    try{
      const r=await fetchText(url,{timeout:8000,headers:{Accept:'application/rss+xml,application/xml,text/html;q=0.9,*/*;q=0.5'}});
      if(!r.ok)continue;
      if(url.includes('/rss')){const items=parseTrendsRss(r.text);if(items.length)return {items,health:{state:'OK',provider:'google-trends-rss',count:items.length}};}
      // HTML fallback: extract rough trend rows from visible text if RSS unavailable.
      const text=cleanHtml(r.text);if(text.length>1000)return {items:[],health:{state:'DEGRADED',provider:'google-trends-html',detail:'html shell only'}};
    }catch(e){}
  }
  return {items:[],health:{state:'ERROR',provider:'google-trends'}};
}
function memberTrendSignal(member,items=[]){
  const name=normalize(member.name);let best=null;
  for(const x of items){if(!x.text.includes(name))continue;const exact=normalize(x.title).includes(name);const ageH=Number.isFinite(x.pubTs)?Math.max(0,(Date.now()-x.pubTs)/3600000):12;const traffic=Math.max(0,x.traffic||0);const trafficScore=Math.min(100,20+18*Math.log10(Math.max(1,traffic)));const score=Math.min(100,(exact?25:8)+trafficScore*.65+20*Math.pow(2,-ageH/6));const rec={score,traffic,exact,latest:x.pubTs||null,title:x.title};if(!best||rec.score>best.score)best=rec;}
  return best||{score:0,traffic:0,exact:false,latest:null,title:null};
}
function yyyyMMddHH(ms){const d=new Date(ms);return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}${String(d.getUTCHours()).padStart(2,'0')}`;}
async function wikiTitle(member){
  const q=encodeURIComponent(`${member.name} 국회의원`),url=`https://ko.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&srlimit=5&srsearch=${q}`;
  const r=await fetchText(url,{timeout:7000,headers:{Accept:'application/json'}});if(!r.ok)return null;
  let j;try{j=JSON.parse(r.text)}catch(e){return null;}
  const rows=j.query?.search||[];
  const scored=rows.map(x=>{const t=x.title||'',sn=cleanHtml(x.snippet||'');let s=0;if(t===member.name)s+=10;if(t.includes(member.name))s+=5;if(/정치인|국회의원|대한민국/.test(`${t} ${sn}`))s+=4;return {title:t,s};}).sort((a,b)=>b.s-a.s);
  return scored[0]?.s>=5?scored[0].title:null;
}
async function fetchWikiInterest(member){
  try{
    const title=await wikiTitle(member);if(!title)return {summary:null,health:{state:'EMPTY',provider:'wikimedia-pageviews'}};
    const end=Date.now()-3600000,start=end-8*24*3600000;
    const url=`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ko.wikipedia.org/all-access/user/${encodeURIComponent(title.replace(/ /g,'_'))}/hourly/${yyyyMMddHH(start)}/${yyyyMMddHH(end)}`;
    const r=await fetchText(url,{timeout:8000,headers:{Accept:'application/json'}});if(!r.ok)return {summary:null,health:{state:'ERROR',provider:'wikimedia-pageviews',status:r.status}};
    let j;try{j=JSON.parse(r.text)}catch(e){return {summary:null,health:{state:'ERROR',provider:'wikimedia-pageviews',detail:'json'}};}
    const vals=(j.items||[]).map(x=>({ts:Date.parse(String(x.timestamp||'').replace(/^(\d{4})(\d{2})(\d{2})(\d{2}).*$/,'$1-$2-$3T$4:00:00Z')),views:Number(x.views||0)})).filter(x=>Number.isFinite(x.ts));
    const now=Date.now(),sum=h=>vals.filter(x=>now-x.ts<=h*3600000).reduce((a,x)=>a+x.views,0);
    const c6=sum(6),c24=sum(24),c7=sum(168),prev=Math.max(0,c7-c24)/24*6;
    return {summary:{count6:c6,count24:c24,count7d:c7,sources6:c6?1:0,sources24:c24?1:0,event6:0,title6:0,latest:vals.length?Math.max(...vals.filter(x=>x.views>0).map(x=>x.ts)):null,provider:'wikimedia-pageviews',baseline6:prev,pageTitle:title},health:{state:'OK',provider:'wikimedia-pageviews',title}};
  }catch(e){return {summary:null,health:{state:'ERROR',provider:'wikimedia-pageviews',detail:e.message||String(e)}};}
}
async function collectGlobalKeyless(active=[]){
  const [naverRobots,daumRobots,youtubeRobots,trends]=await Promise.all([
    checkRobots('https://search.naver.com','/search.naver'),
    checkRobots('https://search.daum.net','/search'),
    checkRobots('https://www.youtube.com','/results'),
    fetchGoogleTrendsKR()
  ]);
  const trendSignals={};for(const m of active)trendSignals[m.name]=memberTrendSignal(m,trends.items||[]);
  const rh=x=>x.allowed?'READY':(x.state==='ROBOTS_OK'?'ROBOTS_BLOCKED':'ROBOTS_UNAVAILABLE');
  return {permissions:{naverSearch:naverRobots,daumSearch:daumRobots,youtubeSearch:youtubeRobots},trends:{signals:trendSignals,count:(trends.items||[]).length},health:{naverHtml:{state:rh(naverRobots),detail:naverRobots.state},daumHtml:{state:rh(daumRobots),detail:daumRobots.state},youtubeHtml:{state:rh(youtubeRobots),detail:youtubeRobots.state},googleTrends:trends.health}};
}
async function collectKeylessSurface(member,keywords=[],global={}){
  const out={},health={};
  const [naver,daum]=await Promise.all([
    scrapeSearchPage(member,keywords,'naver',global.permissions?.naverSearch),
    scrapeSearchPage(member,keywords,'daum',global.permissions?.daumSearch)
  ]);
  if(naver.summary)out.naverSurface=naver.summary;health.naverHtml=naver.health;
  if(daum.summary)out.daumSurface=daum.summary;health.daumHtml=daum.health;
  return {channels:out,health};
}
async function collectKeylessEnrichment(member,keywords=[],global={}){
  const out={},health={};
  const wiki=await fetchWikiInterest(member);if(wiki.summary)out.wiki=wiki.summary;health.wiki=wiki.health;
  const trend=global.trends?.signals?.[member.name];if(trend)out.googleTrends=trend;
  // YouTube /results is intentionally not scraped when robots.txt disallows it.
  health.youtubeHtml={state:global.permissions?.youtubeSearch?.allowed?'NOT_USED':'ROBOTS_BLOCKED',detail:global.permissions?.youtubeSearch?.state||'robots'};
  return {channels:out,health};
}
module.exports={collectGlobalKeyless,collectKeylessSurface,collectKeylessEnrichment,surfaceSummary,memberTrendSignal,fetchWikiInterest,checkRobots,robotsAllows};
