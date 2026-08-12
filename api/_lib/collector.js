const {URL}=require('url');
const {collectKeylessSurface,collectKeylessEnrichment}=require('./keyless');
const {collectSearchSurfaces,politicalContext,collectNewsItems,credentialStatus}=require('./naver_common');
const {mark,missing,STATES,healthStateToObservation}=require('./observation');

function cleanHtml(s=''){
  return String(s).replace(/<[^>]+>/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
}
function sourceDomain(link=''){
  try{return new URL(link).hostname.replace(/^www\./,'')}catch(e){return ''}
}
function normalizeTitle(s=''){
  return cleanHtml(s).toLowerCase().replace(/\[[^\]]+\]/g,' ').replace(/\([^)]*연합뉴스[^)]*\)/g,' ').replace(/[^0-9a-z가-힣]+/g,' ').replace(/\s+/g,' ').trim();
}
function normalizeEventText(s=''){
  return cleanHtml(s).toLowerCase().replace(/[^0-9a-z가-힣]+/g,' ').replace(/\s+/g,' ').trim();
}
function dedupe(items){
  const seen=new Set(),out=[];
  for(const x of items){
    const key=x.link?String(x.link).split('?')[0]:normalizeTitle(x.title);
    const titleKey=normalizeTitle(x.title);
    const k=key||titleKey;
    if(!k||seen.has(k)) continue;
    seen.add(k);out.push(x);
  }
  return out;
}
function parseNaverItems(j){
  return (j.items||[]).map(x=>({title:cleanHtml(x.title),desc:cleanHtml(x.description),link:x.originallink||x.link||'',source:sourceDomain(x.originallink||x.link||''),ts:Date.parse(x.pubDate||''),provider:'naver-news'})).filter(x=>Number.isFinite(x.ts));
}
function xmlText(block,tag){
  const m=block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,'i'));
  return m?cleanHtml(m[1]):'';
}
function parseGoogleRss(xml){
  const blocks=String(xml).match(/<item>[\s\S]*?<\/item>/gi)||[];
  return blocks.map(b=>{const title=xmlText(b,'title'),link=xmlText(b,'link'),pubDate=xmlText(b,'pubDate'),source=xmlText(b,'source')||sourceDomain(link);return {title,desc:'',link,source,ts:Date.parse(pubDate),provider:'google-news-rss'};}).filter(x=>Number.isFinite(x.ts));
}
function itemMentionsMember(item,name,member=null){const text=`${item.title} ${item.desc||''}`;if(!text.includes(name))return false;return member?politicalContext(member,text):true;}
function keywordMatch(text,keywords=[]){
  if(!keywords.length) return false;
  const t=normalizeEventText(text);
  return keywords.some(k=>{
    const nk=normalizeEventText(String(k||''));
    if(!nk) return false;
    if(t.includes(nk)) return true;
    const tokens=nk.split(' ').filter(x=>x.length>=2||/^\d+$/.test(x));
    return tokens.length>=2&&tokens.every(tok=>t.includes(tok));
  });
}
function emptySummary(provider='unconfigured',detail='not configured'){return missing(provider,detail);}
function summarize(items,member,keywords,nowMs,provider,totalCount=null){
  const arr=dedupe(items).filter(x=>itemMentionsMember(x,member.name,member));
  const h=n=>n*3600000;
  const recent7=arr.filter(x=>nowMs>=x.ts&&nowMs-x.ts<=h(168));
  const recent24=recent7.filter(x=>nowMs-x.ts<=h(24));
  const recent6=recent24.filter(x=>nowMs-x.ts<=h(6));
  const sources6=new Set(recent6.map(x=>x.source).filter(Boolean));
  const sources24=new Set(recent24.map(x=>x.source).filter(Boolean));
  const event6=recent6.filter(x=>keywordMatch(`${x.title} ${x.desc||''}`,keywords));
  const title6=recent6.filter(x=>x.title.includes(member.name)).length;
  const latest=recent7.length?Math.max(...recent7.map(x=>x.ts)):null;
  const summary={count6:recent6.length,count24:recent24.length,count7d:recent7.length,sources6:sources6.size,sources24:sources24.size,event6:event6.length,title6,latest,totalCount,provider,
    headlines:recent6.slice(0,8).map(x=>({title:x.title,source:x.source,ts:x.ts,link:x.link,channel:provider}))};
  return mark(summary,provider,recent7.length?STATES.OBSERVED:STATES.ZERO);
}
async function fetchNaverNews(member){
  const r=await collectNewsItems(member);
  if(!r.items)throw new Error(r.error||credentialStatus().detail||'NAVER news unavailable');
  return {items:parseNaverItems({items:r.items}),mode:r.mode||'unknown'};
}
async function fetchGoogleNews(member){
  const party=member.party&&member.party!=='공석'?member.party:'';
  const qualifier=party?`(국회의원 OR "${party}")`:'국회의원';
  const query=`"${member.name}" ${qualifier} when:7d`;
  const url=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 jjdd-nowrank/1.4'}});
  if(!r.ok) throw new Error(`Google News ${r.status}`);
  return parseGoogleRss(await r.text());
}
function parseKakaoDocs(j,type){
  const docs=j.documents||[];
  return {totalCount:Number(j.meta?.total_count||0),items:docs.map(x=>({
    title:cleanHtml(x.title||''),desc:cleanHtml(x.contents||''),link:x.url||'',
    source:cleanHtml(x.blogname||x.cafename||x.author||sourceDomain(x.url||'')),ts:Date.parse(x.datetime||''),provider:`kakao-${type}`
  })).filter(x=>Number.isFinite(x.ts))};
}
async function fetchKakao(member,type){
  const key=process.env.KAKAO_REST_API_KEY;
  if(!key) return null;
  const endpoint={web:'web',blog:'blog',cafe:'cafe',video:'vclip'}[type];
  const query=`${member.name} 국회의원`;
  const url=`https://dapi.kakao.com/v2/search/${endpoint}?query=${encodeURIComponent(query)}&sort=recency&size=50&page=1`;
  const r=await fetch(url,{headers:{Authorization:`KakaoAK ${key}`}});
  if(!r.ok) throw new Error(`Kakao ${type} ${r.status}`);
  return parseKakaoDocs(await r.json(),type);
}
function mergeSummaries(list,provider='news-multi'){
  const valid=list.filter(Boolean),usable=valid.filter(x=>x?.observation?.state!=='MISSING'),heads=dedupe(usable.flatMap(x=>x.headlines||[]));
  const latest=usable.map(x=>x.latest).filter(Number.isFinite);
  const summary={count6:usable.reduce((a,x)=>a+Number(x.count6||0),0),count24:usable.reduce((a,x)=>a+Number(x.count24||0),0),count7d:usable.reduce((a,x)=>a+Number(x.count7d||0),0),
    sources6:new Set(usable.flatMap(x=>(x.headlines||[]).filter(h=>Date.now()-h.ts<=21600000).map(h=>h.source))).size,
    sources24:usable.reduce((a,x)=>Math.max(a,Number(x.sources24||0)),0),event6:usable.reduce((a,x)=>a+Number(x.event6||0),0),title6:usable.reduce((a,x)=>a+Number(x.title6||0),0),
    latest:latest.length?Math.max(...latest):null,provider,headlines:heads.slice(0,12),providers:valid.map(x=>x.provider),sourceStates:Object.fromEntries(valid.map(x=>[x.provider,x?.observation?.state||'UNKNOWN'])),sourceDetails:Object.fromEntries(valid.map(x=>[x.provider,x?.observation?.detail||'']))};
  const st=!usable.length?STATES.MISSING:(summary.count7d>0?STATES.OBSERVED:STATES.ZERO);
  return mark(summary,provider,st,!usable.length?'all news sources missing':'');
}
function stampKeylessChannel(summary,health,provider){
  if(!summary)return missing(provider,health?.detail||health?.state||'no summary',provider.includes('surface')||provider.includes('html')?'surface':'count');
  const has=Number(summary.surfaceHits||0)+Number(summary.count7d||0)+Number(summary.score||0)>0;
  return mark(summary,summary.provider||provider,healthStateToObservation(health,has),health?.detail||'');
}
async function collectMember(member,keywords=[],globalSignals={}){
  const nowMs=Date.now(),warnings=[];
  const safe=async(label,fn,fallback=null)=>{try{return await fn()}catch(e){warnings.push(`${label}: ${e.message||e}`);return fallback;}};
  const kakaoPromise=process.env.KAKAO_REST_API_KEY?Promise.all(['web','blog','cafe','video'].map(async type=>[type,await safe(`Kakao ${type}`,()=>fetchKakao(member,type),null)])):Promise.resolve([]),allowNaver=globalSignals?.naverApiAvailable!==false;
  const [google,naverResult,naverCommon,keyless,kakaoRows]=await Promise.all([
    safe('Google News',()=>fetchGoogleNews(member),[]),allowNaver?safe('NAVER News',()=>fetchNaverNews(member),null):Promise.resolve(null),allowNaver?safe('NAVER Common',()=>collectSearchSurfaces(member,keywords),null):Promise.resolve(null),safe('Keyless Surface',()=>collectKeylessSurface(member,keywords,globalSignals),null),kakaoPromise
  ]);
  const googleSummary=summarize(google||[],member,keywords,nowMs,'google-news-rss');
  const naverItems=naverResult?.items||null,naverMode=naverResult?.mode||credentialStatus().mode;
  const naverErr=!allowNaver?(globalSignals?.naverApiDetail||'NAVER probe failed; skipped this refresh'):(warnings.find(x=>x.startsWith('NAVER News:'))?.replace(/^NAVER News:\s*/, '')||(!credentialStatus().configured?credentialStatus().detail:'NAVER news request failed'));
  const naverSummary=naverItems?summarize(naverItems,member,keywords,nowMs,`naver-news-${naverMode}`):missing(`naver-news-${naverMode||'none'}`,naverErr);
  const news=mergeSummaries([googleSummary,naverSummary],'news');
  const channels={news,googleTrends:mark(globalSignals?.trends?.signals?.[member.name]||{provider:'google-trends-rising',score:0,traffic:0,exact:false,latest:null,title:null},'google-trends-rising',(globalSignals?.trends?.signals?.[member.name]?.score||0)>0?STATES.OBSERVED:STATES.ZERO)};
  if(naverCommon)Object.assign(channels,naverCommon);else {const nd=!allowNaver?(globalSignals?.naverApiDetail||'NAVER probe failed; skipped this refresh'):'NAVER common collection failed';Object.assign(channels,{naverBlogApi:missing('naver-blog-api',nd,'surface'),naverCafeApi:missing('naver-cafe-api',nd,'surface'),naverWebApi:missing('naver-web-api',nd,'surface')});}
  if(process.env.KAKAO_REST_API_KEY){for(const [type,res] of kakaoRows)channels[type]=res?summarize(res.items,member,keywords,nowMs,`kakao-${type}`,res.totalCount):missing(`kakao-${type}`,`Kakao ${type} request failed`);}else for(const type of ['web','blog','cafe','video'])channels[type]=missing(`kakao-${type}`,'KAKAO_REST_API_KEY not configured');
  const surfaceHealth=keyless?.health||{};
  channels.naverSurface=stampKeylessChannel(keyless?.channels?.naverSurface,surfaceHealth.naverHtml,'naver-surface-html');
  channels.daumSurface=stampKeylessChannel(keyless?.channels?.daumSurface,surfaceHealth.daumHtml,'daum-surface-html');
  const evidenceItems=dedupe(Object.values(channels).flatMap(x=>x?.headlines||[])).slice(0,40);
  return {channels,evidenceItems,health:surfaceHealth,warning:warnings.length?warnings.join('; '):null,providers:{googleNews:true,naverNews:Boolean(naverItems),naverMode,naverCommon:credentialStatus().configured,kakao:Boolean(process.env.KAKAO_REST_API_KEY),googleTrends:true}};
}


async function fetchGoogleNewsQuery(query,provider='google-news-global'){
  const url=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 jjdd-nowrank/1.6'}});
  if(!r.ok) throw new Error(`Google News global ${r.status}`);
  return parseGoogleRss(await r.text()).map(x=>({...x,provider}));
}
function memberMapFromCorpus(items,active,eventKeywords=[]){
  const members={};for(const m of active)members[m.name]={eventCount:0,eventTitleCount:0,eventSources:new Set(),broadCount:0,broadTitleCount:0,broadSources:new Set(),latest:null};
  for(const x of items){
    const txt=`${x.title} ${x.desc||''}`;for(const m of active){if(!txt.includes(m.name))continue;const st=members[m.name],isEvent=(x.tags||[]).includes('event')||keywordMatch(txt,eventKeywords);if(isEvent){st.eventCount++;if(x.title.includes(m.name))st.eventTitleCount++;if(x.source)st.eventSources.add(x.source);}else{st.broadCount++;if(x.title.includes(m.name))st.broadTitleCount++;if(x.source)st.broadSources.add(x.source);}st.latest=Math.max(st.latest||0,x.ts||0);}
  }
  const out={};for(const [name,s] of Object.entries(members))out[name]={eventCount:s.eventCount,eventTitleCount:s.eventTitleCount,eventSources:s.eventSources.size,broadCount:s.broadCount,broadTitleCount:s.broadTitleCount,broadSources:s.broadSources.size,latest:s.latest||null};return out;
}
async function collectGlobalPolitics(active,eventTitle='',eventKeywords=[]){
  const specs=[];const title=String(eventTitle||'').trim();
  if(title&&title!=='현재 주요 정치 이슈'){specs.push({q:`"${title}" when:1d`,tag:'event'});specs.push({q:`${title} when:1d`,tag:'event'});}
  const kws=(eventKeywords||[]).filter(Boolean).slice(0,5);if(kws.length)specs.push({q:`${kws.map(k=>`"${k}"`).join(' OR ')} when:1d`,tag:'event'});
  specs.push({q:'국회 정치 when:1d',tag:'broad'},{q:'더불어민주당 국민의힘 when:1d',tag:'broad'});
  const warnings=[],all=[];
  for(const s of specs){try{const rows=await fetchGoogleNewsQuery(s.q,`google-news-${s.tag}`);for(const x of rows)all.push({...x,tags:[s.tag]});}catch(e){warnings.push(e.message||String(e));}}
  const byKey=new Map();for(const x of all){const k=(x.link||normalizeTitle(x.title)).split('?')[0];const prev=byKey.get(k);if(prev){prev.tags=[...new Set([...(prev.tags||[]),...(x.tags||[])])];}else byKey.set(k,{...x});}
  const items=[...byKey.values()],members=memberMapFromCorpus(items,active,eventKeywords),eventItems=items.filter(x=>(x.tags||[]).includes('event')),broadItems=items.filter(x=>(x.tags||[]).includes('broad'));
  return {items:items.slice(0,260),members,eventArticleCount:eventItems.length,eventSourceCount:new Set(eventItems.map(x=>x.source).filter(Boolean)).size,broadArticleCount:broadItems.length,broadSourceCount:new Set(broadItems.map(x=>x.source).filter(Boolean)).size,warnings};
}

function isoAgo(hours){return new Date(Date.now()-hours*3600000).toISOString();}
async function fetchYouTube(member,keywords=[]){
  const key=process.env.YOUTUBE_API_KEY;if(!key) return null;
  const q=`${member.name} 국회의원`;
  const url=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=25&regionCode=KR&relevanceLanguage=ko&publishedAfter=${encodeURIComponent(isoAgo(168))}&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
  const r=await fetch(url);if(!r.ok) throw new Error(`YouTube search ${r.status}`);
  const j=await r.json(),ids=(j.items||[]).map(x=>x.id?.videoId).filter(Boolean);
  let stats={};
  if(ids.length){
    const vr=await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.join(',')}&key=${encodeURIComponent(key)}`);
    if(vr.ok){const vj=await vr.json();for(const v of vj.items||[]) stats[v.id]=v.statistics||{};}
  }
  const now=Date.now(),items=(j.items||[]).map(x=>({title:cleanHtml(x.snippet?.title||''),desc:cleanHtml(x.snippet?.description||''),link:`https://www.youtube.com/watch?v=${x.id?.videoId||''}`,source:x.snippet?.channelTitle||'',ts:Date.parse(x.snippet?.publishedAt||''),id:x.id?.videoId,views:Number(stats[x.id?.videoId]?.viewCount||0),comments:Number(stats[x.id?.videoId]?.commentCount||0),provider:'youtube'})).filter(x=>Number.isFinite(x.ts)&&itemMentionsMember(x,member.name));
  const s=summarize(items,member,keywords,now,'youtube',Number(j.pageInfo?.totalResults||0));
  const h=n=>n*3600000; s.views6=items.filter(x=>now-x.ts<=h(6)).reduce((a,x)=>a+x.views,0);s.views24=items.filter(x=>now-x.ts<=h(24)).reduce((a,x)=>a+x.views,0);s.views7d=items.reduce((a,x)=>a+x.views,0);s.channels6=new Set(items.filter(x=>now-x.ts<=h(6)).map(x=>x.source)).size;
  return s;
}
async function fetchX(member){
  const token=process.env.X_BEARER_TOKEN;if(!token) return null;
  const query=`"${member.name}" lang:ko -is:retweet`;
  const url=`https://api.x.com/2/tweets/counts/recent?query=${encodeURIComponent(query)}&granularity=hour`;
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok) throw new Error(`X counts ${r.status}`);
  const j=await r.json(),bins=j.data||[],now=Date.now();
  const sum=h=>bins.filter(b=>now-Date.parse(b.end)<=h*3600000).reduce((a,b)=>a+Number(b.tweet_count||0),0);
  const latest=bins.filter(b=>Number(b.tweet_count)>0).map(b=>Date.parse(b.end)).filter(Number.isFinite);
  return {count6:sum(6),count24:sum(24),count7d:sum(168),sources6:1,sources24:1,event6:0,title6:0,latest:latest.length?Math.max(...latest):null,provider:'x-counts',headlines:[],totalCount:Number(j.meta?.total_tweet_count||0)};
}
async function collectEnrichmentMember(member,keywords=[],globalSignals={},options={}){
  const out={},warnings=[],health={};
  if(process.env.YOUTUBE_API_KEY&&options.allowYoutube!==false){try{const y=await fetchYouTube(member,keywords);out.youtube=y?mark(y,'youtube',Number(y.count7d||0)>0?STATES.OBSERVED:STATES.ZERO):missing('youtube','empty response');}catch(e){warnings.push(String(e.message||e));out.youtube=missing('youtube',e.message||String(e));}}else out.youtube=missing('youtube',process.env.YOUTUBE_API_KEY?'not selected for YouTube quota this refresh':'YOUTUBE_API_KEY not configured');
  if(process.env.X_BEARER_TOKEN&&options.allowX!==false){try{const x=await fetchX(member);out.x=x?mark(x,'x-counts',Number(x.count7d||0)>0?STATES.OBSERVED:STATES.ZERO):missing('x-counts','empty response');}catch(e){warnings.push(String(e.message||e));out.x=missing('x-counts',e.message||String(e));}}else out.x=missing('x-counts',process.env.X_BEARER_TOKEN?'not selected for X quota this refresh':'X_BEARER_TOKEN not configured');
  try{
    const k=await collectKeylessEnrichment(member,keywords,globalSignals);Object.assign(health,k.health||{});
    out.wiki=stampKeylessChannel(k.channels?.wiki,health.wiki,'wikimedia-pageviews');
    out.naverView=stampKeylessChannel(k.channels?.naverView,health.naverView,'naver-view-html');
    out.daumBlog=stampKeylessChannel(k.channels?.daumBlog,health.daumBlog,'daum-blog-html');
    out.youtubeHtml=stampKeylessChannel(k.channels?.youtubeHtml,health.youtubeHtml,'youtube-html');
  }catch(e){warnings.push(`keyless: ${e.message||e}`);}
  return {channels:out,health,warning:warnings.length?warnings.join('; '):null};
}
function preliminaryHeat(signal){
  const c=signal?.channels||{},news=c.news||{},portal=['web','blog','cafe','video'].map(k=>c[k]||{}),gt=c.googleTrends||{};
  const surf=(c.naverSurface?.surfaceHits||0)+(c.daumSurface?.surfaceHits||0);
  return 5*(news.event6||0)+3*(news.count6||0)+1.5*(news.sources6||0)+portal.reduce((a,x)=>a+1.5*(x.count6||0)+2*(x.event6||0),0)+0.8*(gt.score||0)+0.7*surf;
}
module.exports={collectMember,collectEnrichmentMember,preliminaryHeat,collectGlobalPolitics,cleanHtml,normalizeTitle,normalizeEventText,summarize,keywordMatch};
