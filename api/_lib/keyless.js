const {URL}=require('url');

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36 JJDD-NowRank/1.6';
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
async function fetchText(url,{timeout=8500,headers={}}={}){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
  try{
    const r=await fetch(url,{redirect:'follow',signal:ctl.signal,headers:{'User-Agent':UA,'Accept-Language':'ko-KR,ko;q=0.9,en;q=0.5','Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',...headers}});
    return {ok:r.ok,status:r.status,url:r.url,text:await r.text(),type:r.headers.get('content-type')||'',headers:r.headers};
  }finally{clearTimeout(timer);}
}
function robotsGroups(txt=''){
  const groups=[];let agents=[],rules=[];
  const flush=()=>{if(agents.length)groups.push({agents:[...agents],rules:[...rules]});agents=[];rules=[];};
  for(const raw of String(txt).split(/\r?\n/)){
    const line=raw.replace(/#.*$/,'').trim();if(!line)continue;
    const i=line.indexOf(':');if(i<0)continue;
    const k=line.slice(0,i).trim().toLowerCase(),v=line.slice(i+1).trim();
    if(k==='user-agent'){if(rules.length)flush();agents.push(v.toLowerCase());}
    else if((k==='allow'||k==='disallow')&&agents.length)rules.push({kind:k,path:v});
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
  const allowed=rec.text===null?null:(rec.text===''?true:robotsAllows(rec.text,path));
  return {...rec,allowed,path};
}
function relativeFreshHints(text=''){
  const t=cleanHtml(text);let n=0;
  n+=(t.match(/\b\d+\s*분\s*전\b/g)||[]).length;
  n+=(t.match(/\b\d+\s*시간\s*전\b/g)||[]).length;
  n+=(t.match(/오늘\s+오[전후]\s*\d{1,2}:\d{2}/g)||[]).length;
  n+=(t.match(/방금\s*전|조금\s*전/g)||[]).length;
  return n;
}
function extractLinks(html='',name=''){
  const out=[];const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(html))&&out.length<120){const text=cleanHtml(m[2]);if(!text||!text.includes(name))continue;out.push({link:m[1],title:text});}
  return out;
}
function surfaceSummary(html,member,keywords=[],provider='surface'){
  const text=cleanHtml(html),norm=normalize(text),name=member.name;
  const nameHits=(text.match(new RegExp(escRe(name),'g'))||[]).length;
  const eventHits=keywords.reduce((a,k)=>{const nk=normalize(k);return a+(nk&&norm.includes(nk)?1:0)},0);
  const freshHints=relativeFreshHints(html);
  const links=extractLinks(html,name);
  const uniqueLinks=[...new Map(links.map(x=>[x.link.split('&')[0],x])).values()];
  const resultHits=Math.min(100,Math.max(uniqueLinks.length,Math.round(nameHits/2.5)));
  return {provider,surfaceHits:resultHits,nameHits,eventHits,freshHits:Math.min(resultHits,freshHints),latest:freshHints?Date.now():null,totalCount:null,
    headlines:uniqueLinks.slice(0,10).map(x=>({...x,source:provider,ts:Date.now(),channel:provider}))};
}
function challengePage(text=''){
  return /captcha|비정상적인 접근|자동입력 방지|unusual traffic|접근이 제한|verify you are human|robot check|consent\.youtube/i.test(String(text));
}
async function scrapeSearchPage(member,keywords,kind,permission,variant='all'){
  let cfg;
  const q=encodeURIComponent(member.name+' 국회의원');
  if(kind==='naver'){
    cfg=variant==='view'
      ?{origin:'https://search.naver.com',path:'/search.naver',url:`https://search.naver.com/search.naver?where=view&sm=tab_jum&query=${q}`,provider:'naver-view-html'}
      :{origin:'https://search.naver.com',path:'/search.naver',url:`https://search.naver.com/search.naver?where=nexearch&sm=tab_jum&query=${q}`,provider:'naver-html'};
  }else{
    cfg=variant==='blog'
      ?{origin:'https://search.daum.net',path:'/search',url:`https://search.daum.net/search?w=blog&q=${q}`,provider:'daum-blog-html'}
      :{origin:'https://search.daum.net',path:'/search',url:`https://search.daum.net/search?w=tot&q=${q}`,provider:'daum-html'};
  }
  const p=permission||await checkRobots(cfg.origin,cfg.path);
  // robots is advisory here: public HTML is attempted once. No proxy rotation, CAPTCHA bypass or auth bypass is used.
  try{
    const r=await fetchText(cfg.url,{timeout:8500});
    const base={provider:cfg.provider,status:r.status,robotsAllowed:p.allowed,robotsState:p.state};
    if(r.status===403||r.status===401||r.status===429)return {summary:null,health:{state:'BLOCKED',...base}};
    if(!r.ok)return {summary:null,health:{state:'ERROR',...base}};
    if(challengePage(r.text))return {summary:null,health:{state:'BLOCKED',detail:'challenge-page',...base}};
    const summary=surfaceSummary(r.text,member,keywords,cfg.provider);
    const state=summary.surfaceHits>0?'OK':'EMPTY';
    return {summary,health:{state,...base,detail:p.allowed===false?'robots-disallow-advisory · public HTML fetched without bypass':undefined}};
  }catch(e){return {summary:null,health:{state:'ERROR',provider:cfg.provider,detail:e.message||String(e),robotsAllowed:p.allowed,robotsState:p.state}};}
}
function xmlTag(block,tag){
  const m=block.match(new RegExp(`<${tag.replace(':','\\:')}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag.replace(':','\\:')}>`,'i'));
  return m?cleanHtml(m[1]):'';
}
function parseTrendsRss(xml=''){
  const blocks=String(xml).match(/<item>[\s\S]*?<\/item>/gi)||[];
  return blocks.map(b=>{
    const title=xmlTag(b,'title'),traffic=xmlTag(b,'ht:approx_traffic')||xmlTag(b,'approx_traffic'),pub=xmlTag(b,'pubDate');
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
      const r=await fetchText(url,{timeout:9000,headers:{Accept:'application/rss+xml,application/xml,text/html;q=0.9,*/*;q=0.5'}});
      if(!r.ok)continue;
      if(url.includes('/rss')){const items=parseTrendsRss(r.text);if(items.length)return {items,health:{state:'OK',provider:'google-trends-rss',count:items.length}};}
      const text=cleanHtml(r.text);if(text.length>1000)return {items:[],health:{state:'DEGRADED',provider:'google-trends-html',detail:'html shell only'}};
    }catch(e){}
  }
  return {items:[],health:{state:'ERROR',provider:'google-trends'}};
}
function memberTrendSignal(member,items=[]){
  const name=normalize(member.name);let best=null;
  for(const x of items){
    if(!x.text.includes(name))continue;
    const exact=normalize(x.title).includes(name),ageH=Number.isFinite(x.pubTs)?Math.max(0,(Date.now()-x.pubTs)/3600000):12,traffic=Math.max(0,x.traffic||0);
    const trafficScore=Math.min(100,20+18*Math.log10(Math.max(1,traffic)));
    const score=Math.min(100,(exact?25:8)+trafficScore*.65+20*Math.pow(2,-ageH/6));
    const rec={score,traffic,exact,latest:x.pubTs||null,title:x.title};if(!best||rec.score>best.score)best=rec;
  }
  return best||{score:0,traffic:0,exact:false,latest:null,title:null};
}
function yyyyMMddHH(ms){const d=new Date(ms);return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}${String(d.getUTCHours()).padStart(2,'0')}`;}
function yyyyMMdd(ms){const d=new Date(ms);return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;}
async function wikiTitle(member){
  const q=encodeURIComponent(`${member.name} 국회의원`),url=`https://ko.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&srlimit=5&srsearch=${q}`;
  const r=await fetchText(url,{timeout:7500,headers:{Accept:'application/json'}});if(!r.ok)return null;
  let j;try{j=JSON.parse(r.text)}catch(e){return null;}
  const rows=j.query?.search||[];
  const scored=rows.map(x=>{const t=x.title||'',sn=cleanHtml(x.snippet||'');let s=0;if(t===member.name)s+=10;if(t.includes(member.name))s+=5;if(/정치인|국회의원|대한민국/.test(`${t} ${sn}`))s+=4;return {title:t,s};}).sort((a,b)=>b.s-a.s);
  return scored[0]?.s>=5?scored[0].title:null;
}
function wikiSummaryFromHourly(items,title){
  const vals=(items||[]).map(x=>({ts:Date.parse(String(x.timestamp||'').replace(/^(\d{4})(\d{2})(\d{2})(\d{2}).*$/,'$1-$2-$3T$4:00:00Z')),views:Number(x.views||0)})).filter(x=>Number.isFinite(x.ts));
  const now=Date.now(),sum=h=>vals.filter(x=>now-x.ts<=h*3600000).reduce((a,x)=>a+x.views,0);
  const c6=sum(6),c24=sum(24),c7=sum(168),prev=Math.max(0,c7-c24)/24*6;
  return {count6:c6,count24:c24,count7d:c7,sources6:c6?1:0,sources24:c24?1:0,event6:0,title6:0,latest:vals.length?Math.max(...vals.filter(x=>x.views>0).map(x=>x.ts)):null,provider:'wikimedia-pageviews-hourly',baseline6:prev,pageTitle:title,granularity:'hourly'};
}
function wikiSummaryFromDaily(items,title){
  const vals=(items||[]).map(x=>({ts:Date.parse(String(x.timestamp||'').replace(/^(\d{4})(\d{2})(\d{2}).*$/,'$1-$2-$3T00:00:00Z')),views:Number(x.views||0)})).filter(x=>Number.isFinite(x.ts)).sort((a,b)=>a.ts-b.ts);
  if(!vals.length)return null;
  const recent=vals.slice(-1)[0]?.views||0,prev=vals.slice(-8,-1).map(x=>x.views||0),avg=prev.length?prev.reduce((a,b)=>a+b,0)/prev.length:0;
  const c6=recent/4,c24=recent,c7=vals.slice(-7).reduce((a,x)=>a+x.views,0),baseline6=Math.max(.25,avg/4);
  return {count6:c6,count24:c24,count7d:c7,sources6:c6?1:0,sources24:c24?1:0,event6:0,title6:0,latest:vals.slice(-1)[0].ts,provider:'wikimedia-pageviews-daily',baseline6,pageTitle:title,granularity:'daily-proxy'};
}
async function fetchWikiInterest(member){
  try{
    const title=await wikiTitle(member);if(!title)return {summary:null,health:{state:'EMPTY',provider:'wikimedia-pageviews'}};
    const article=encodeURIComponent(title.replace(/ /g,'_')),end=Date.now()-3600000,start=end-8*24*3600000;
    let r=await fetchText(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ko.wikipedia.org/all-access/user/${article}/hourly/${yyyyMMddHH(start)}/${yyyyMMddHH(end)}`,{timeout:8500,headers:{Accept:'application/json'}});
    if(r.ok){try{const j=JSON.parse(r.text),summary=wikiSummaryFromHourly(j.items,title);if(summary)return {summary,health:{state:'OK',provider:'wikimedia-pageviews',title,granularity:'hourly'}};}catch(e){}}
    const dend=Date.now()-24*3600000,dstart=dend-14*24*3600000;
    r=await fetchText(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ko.wikipedia.org/all-access/user/${article}/daily/${yyyyMMdd(dstart)}/${yyyyMMdd(dend)}`,{timeout:8500,headers:{Accept:'application/json'}});
    if(!r.ok)return {summary:null,health:{state:'ERROR',provider:'wikimedia-pageviews',status:r.status}};
    let j;try{j=JSON.parse(r.text)}catch(e){return {summary:null,health:{state:'ERROR',provider:'wikimedia-pageviews',detail:'json'}};}
    const summary=wikiSummaryFromDaily(j.items,title);return summary?{summary,health:{state:'OK',provider:'wikimedia-pageviews',title,granularity:'daily-fallback'}}:{summary:null,health:{state:'EMPTY',provider:'wikimedia-pageviews',title}};
  }catch(e){return {summary:null,health:{state:'ERROR',provider:'wikimedia-pageviews',detail:e.message||String(e)}};}
}
function findJsonObjectAfter(html,markers=[]){
  for(const marker of markers){
    const idx=html.indexOf(marker);if(idx<0)continue;let start=html.indexOf('{',idx);if(start<0)continue;
    let depth=0,inStr=false,esc=false;
    for(let i=start;i<html.length;i++){
      const ch=html[i];
      if(inStr){if(esc)esc=false;else if(ch==='\\')esc=true;else if(ch==='"')inStr=false;continue;}
      if(ch==='"'){inStr=true;continue;}if(ch==='{')depth++;else if(ch==='}'){depth--;if(depth===0){try{return JSON.parse(html.slice(start,i+1));}catch(e){break;}}}
    }
  }
  return null;
}
function ytText(x){if(!x)return '';if(typeof x.simpleText==='string')return x.simpleText;if(Array.isArray(x.runs))return x.runs.map(r=>r.text||'').join('');return '';}
function parseRelativeTime(text=''){
  const t=String(text);const now=Date.now();
  let m=t.match(/(\d+)\s*분\s*전/);if(m)return now-Number(m[1])*60000;
  m=t.match(/(\d+)\s*시간\s*전/);if(m)return now-Number(m[1])*3600000;
  m=t.match(/(\d+)\s*일\s*전/);if(m)return now-Number(m[1])*86400000;
  m=t.match(/(\d+)\s*주\s*전/);if(m)return now-Number(m[1])*7*86400000;
  m=t.match(/(\d+)\s*month/i);if(m)return now-Number(m[1])*30*86400000;
  m=t.match(/(\d+)\s*hour/i);if(m)return now-Number(m[1])*3600000;
  m=t.match(/(\d+)\s*day/i);if(m)return now-Number(m[1])*86400000;
  return null;
}
function parseViews(text=''){
  const t=String(text).replace(/,/g,'');let m=t.match(/([0-9.]+)\s*만/);if(m)return Math.round(Number(m[1])*1e4);m=t.match(/([0-9.]+)\s*천/);if(m)return Math.round(Number(m[1])*1e3);m=t.match(/([0-9.]+)\s*K/i);if(m)return Math.round(Number(m[1])*1e3);m=t.match(/([0-9.]+)\s*M/i);if(m)return Math.round(Number(m[1])*1e6);m=t.match(/([0-9]+)/);return m?Number(m[1]):0;
}
function collectVideoRenderers(obj,out=[]){
  if(!obj||typeof obj!=='object')return out;
  if(obj.videoRenderer){const v=obj.videoRenderer,id=v.videoId||'',title=ytText(v.title),published=ytText(v.publishedTimeText),views=ytText(v.viewCountText)||ytText(v.shortViewCountText),channel=ytText(v.ownerText)||ytText(v.longBylineText);out.push({id,title,published,views,channel,desc:ytText(v.descriptionSnippet)});}
  for(const v of Object.values(obj))if(v&&typeof v==='object')collectVideoRenderers(v,out);
  return out;
}
async function scrapeYouTube(member,keywords=[],permission){
  const q=encodeURIComponent(member.name+' 국회의원'),url=`https://www.youtube.com/results?search_query=${q}&sp=CAI%253D`;
  const p=permission||await checkRobots('https://www.youtube.com','/results');
  try{
    const r=await fetchText(url,{timeout:10000,headers:{Accept:'text/html,*/*;q=0.8'}}),base={provider:'youtube-html',status:r.status,robotsAllowed:p.allowed,robotsState:p.state};
    if([401,403,429].includes(r.status))return {summary:null,health:{state:'BLOCKED',...base}};if(!r.ok)return {summary:null,health:{state:'ERROR',...base}};if(challengePage(r.text))return {summary:null,health:{state:'BLOCKED',detail:'challenge/consent',...base}};
    const data=findJsonObjectAfter(r.text,['var ytInitialData =','ytInitialData =','"ytInitialData":']);if(!data)return {summary:null,health:{state:'DEGRADED',detail:'ytInitialData-not-found',...base}};
    const rows=collectVideoRenderers(data,[]),seen=new Set(),items=[];
    for(const v of rows){if(!v.id||seen.has(v.id)||!v.title.includes(member.name))continue;seen.add(v.id);const ts=parseRelativeTime(v.published),views=parseViews(v.views);items.push({title:v.title,desc:v.desc,link:`https://www.youtube.com/watch?v=${v.id}`,source:v.channel||'YouTube',ts,views,provider:'youtube-html'});if(items.length>=30)break;}
    const now=Date.now(),valid=items.filter(x=>Number.isFinite(x.ts)),sum=h=>valid.filter(x=>now-x.ts<=h*3600000),s6=sum(6),s24=sum(24),s7=sum(168),latest=valid.length?Math.max(...valid.map(x=>x.ts)):null;
    const event6=s6.filter(x=>keywords.some(k=>normalize(`${x.title} ${x.desc}`).includes(normalize(k)))).length;
    const summary={count6:s6.length,count24:s24.length,count7d:s7.length,sources6:new Set(s6.map(x=>x.source)).size,sources24:new Set(s24.map(x=>x.source)).size,event6,title6:s6.filter(x=>x.title.includes(member.name)).length,latest,provider:'youtube-html',views6:s6.reduce((a,x)=>a+x.views,0),views24:s24.reduce((a,x)=>a+x.views,0),views7d:s7.reduce((a,x)=>a+x.views,0),headlines:s6.slice(0,8).map(x=>({...x,channel:'youtube-html'}))};
    return {summary,health:{state:items.length?'OK':'EMPTY',count:items.length,...base,detail:p.allowed===false?'robots-disallow-advisory · public HTML fetched without bypass':undefined}};
  }catch(e){return {summary:null,health:{state:'ERROR',provider:'youtube-html',detail:e.message||String(e),robotsAllowed:p.allowed,robotsState:p.state}};}
}
async function collectGlobalKeyless(active=[]){
  const [naverRobots,daumRobots,youtubeRobots,trends]=await Promise.all([
    checkRobots('https://search.naver.com','/search.naver'),checkRobots('https://search.daum.net','/search'),checkRobots('https://www.youtube.com','/results'),fetchGoogleTrendsKR()
  ]);
  const trendSignals={};for(const m of active)trendSignals[m.name]=memberTrendSignal(m,trends.items||[]);
  const advisory=x=>x.allowed===true?'READY':x.allowed===false?'ADVISORY_DISALLOW':'ADVISORY_UNKNOWN';
  return {permissions:{naverSearch:naverRobots,daumSearch:daumRobots,youtubeSearch:youtubeRobots},trends:{signals:trendSignals,count:(trends.items||[]).length,items:trends.items||[]},health:{naverHtml:{state:advisory(naverRobots),detail:naverRobots.state},daumHtml:{state:advisory(daumRobots),detail:daumRobots.state},youtubeHtml:{state:advisory(youtubeRobots),detail:youtubeRobots.state},googleTrends:trends.health}};
}
async function collectKeylessSurface(member,keywords=[],global={}){
  const out={},health={};
  const [naver,daum]=await Promise.all([scrapeSearchPage(member,keywords,'naver',global.permissions?.naverSearch,'all'),scrapeSearchPage(member,keywords,'daum',global.permissions?.daumSearch,'all')]);
  if(naver.summary)out.naverSurface=naver.summary;health.naverHtml=naver.health;
  if(daum.summary)out.daumSurface=daum.summary;health.daumHtml=daum.health;
  return {channels:out,health};
}
async function collectKeylessEnrichment(member,keywords=[],global={}){
  const out={},health={};
  const [wiki,naverView,daumBlog,youtube]=await Promise.all([
    fetchWikiInterest(member),scrapeSearchPage(member,keywords,'naver',global.permissions?.naverSearch,'view'),scrapeSearchPage(member,keywords,'daum',global.permissions?.daumSearch,'blog'),scrapeYouTube(member,keywords,global.permissions?.youtubeSearch)
  ]);
  if(wiki.summary)out.wiki=wiki.summary;health.wiki=wiki.health;
  if(naverView.summary)out.naverView=naverView.summary;health.naverView=naverView.health;
  if(daumBlog.summary)out.daumBlog=daumBlog.summary;health.daumBlog=daumBlog.health;
  if(youtube.summary)out.youtubeHtml=youtube.summary;health.youtubeHtml=youtube.health;
  const trend=global.trends?.signals?.[member.name];if(trend)out.googleTrends=trend;
  return {channels:out,health};
}
module.exports={collectGlobalKeyless,collectKeylessSurface,collectKeylessEnrichment,surfaceSummary,memberTrendSignal,fetchWikiInterest,checkRobots,robotsAllows,scrapeYouTube,scrapeSearchPage,cleanHtml,normalize};
