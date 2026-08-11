const {URL}=require('url');
const {collectKeylessSurface,collectKeylessEnrichment}=require('./keyless');

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
function itemMentionsMember(item,name){return `${item.title} ${item.desc||''}`.includes(name);}
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
function emptySummary(provider='unconfigured'){return {count6:0,count24:0,count7d:0,sources6:0,sources24:0,event6:0,title6:0,latest:null,headlines:[],provider,totalCount:null};}
function summarize(items,member,keywords,nowMs,provider,totalCount=null){
  const arr=dedupe(items).filter(x=>itemMentionsMember(x,member.name));
  const h=n=>n*3600000;
  const recent7=arr.filter(x=>nowMs>=x.ts&&nowMs-x.ts<=h(168));
  const recent24=recent7.filter(x=>nowMs-x.ts<=h(24));
  const recent6=recent24.filter(x=>nowMs-x.ts<=h(6));
  const sources6=new Set(recent6.map(x=>x.source).filter(Boolean));
  const sources24=new Set(recent24.map(x=>x.source).filter(Boolean));
  const event6=recent6.filter(x=>keywordMatch(`${x.title} ${x.desc||''}`,keywords));
  const title6=recent6.filter(x=>x.title.includes(member.name)).length;
  const latest=recent7.length?Math.max(...recent7.map(x=>x.ts)):null;
  return {count6:recent6.length,count24:recent24.length,count7d:recent7.length,sources6:sources6.size,sources24:sources24.size,event6:event6.length,title6,latest,totalCount,provider,
    headlines:recent6.slice(0,8).map(x=>({title:x.title,source:x.source,ts:x.ts,link:x.link,channel:provider}))};
}
async function fetchNaverNews(member){
  const id=process.env.NAVER_API_HUB_CLIENT_ID,secret=process.env.NAVER_API_HUB_CLIENT_SECRET;
  if(!id||!secret) return null;
  const q=`${member.name} 국회의원`;
  const url=`https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent(q)}&display=100&sort=date`;
  const r=await fetch(url,{headers:{'X-NCP-APIGW-API-KEY-ID':id,'X-NCP-APIGW-API-KEY':secret}});
  if(!r.ok) throw new Error(`NAVER ${r.status}`);
  return parseNaverItems(await r.json());
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
  const valid=list.filter(Boolean),heads=dedupe(valid.flatMap(x=>x.headlines||[]));
  const latest=valid.map(x=>x.latest).filter(Number.isFinite);
  return {count6:valid.reduce((a,x)=>a+x.count6,0),count24:valid.reduce((a,x)=>a+x.count24,0),count7d:valid.reduce((a,x)=>a+x.count7d,0),
    sources6:new Set(valid.flatMap(x=>(x.headlines||[]).filter(h=>Date.now()-h.ts<=21600000).map(h=>h.source))).size,
    sources24:valid.reduce((a,x)=>Math.max(a,x.sources24||0),0),event6:valid.reduce((a,x)=>a+x.event6,0),title6:valid.reduce((a,x)=>a+x.title6,0),
    latest:latest.length?Math.max(...latest):null,provider,headlines:heads.slice(0,12),providers:valid.map(x=>x.provider)};
}
async function collectMember(member,keywords=[],globalSignals={}){
  const nowMs=Date.now(),warnings=[];
  let google=[],naver=null;
  try{google=await fetchGoogleNews(member);}catch(e){warnings.push(String(e.message||e));}
  try{naver=await fetchNaverNews(member);}catch(e){warnings.push(String(e.message||e));}
  const googleSummary=summarize(google,member,keywords,nowMs,'google-news-rss');
  const naverSummary=naver?summarize(naver,member,keywords,nowMs,'naver-news'):null;
  const news=mergeSummaries([googleSummary,naverSummary],'news');
  const channels={news};
  const gt=globalSignals?.trends?.signals?.[member.name];
  if(gt) channels.googleTrends=gt;
  if(process.env.KAKAO_REST_API_KEY){
    const types=['web','blog','cafe','video'];
    const settled=await Promise.all(types.map(async type=>{try{return [type,await fetchKakao(member,type)]}catch(e){warnings.push(String(e.message||e));return [type,null]}}));
    for(const [type,res] of settled) channels[type]=res?summarize(res.items,member,keywords,nowMs,`kakao-${type}`,res.totalCount):emptySummary(`kakao-${type}-error`);
  }else{
    for(const type of ['web','blog','cafe','video']) channels[type]=emptySummary(`kakao-${type}-unconfigured`);
  }
  let surfaceHealth={};
  try{const k=await collectKeylessSurface(member,keywords,globalSignals);Object.assign(channels,k.channels||{});surfaceHealth=k.health||{};}catch(e){warnings.push(`keyless-surface: ${e.message||e}`);}
  const evidenceItems=dedupe(Object.values(channels).flatMap(x=>x.headlines||[])).slice(0,32);
  return {channels,evidenceItems,health:surfaceHealth,warning:warnings.length?warnings.join('; '):null,providers:{googleNews:true,naverNews:Boolean(naver),kakao:Boolean(process.env.KAKAO_REST_API_KEY),googleTrends:Boolean(gt&&gt.score>0)}};
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
async function collectEnrichmentMember(member,keywords=[],globalSignals={}){
  const out={},warnings=[],health={};
  if(process.env.YOUTUBE_API_KEY){try{out.youtube=await fetchYouTube(member,keywords)}catch(e){warnings.push(String(e.message||e));}}
  if(process.env.X_BEARER_TOKEN){try{out.x=await fetchX(member)}catch(e){warnings.push(String(e.message||e));}}
  try{const k=await collectKeylessEnrichment(member,keywords,globalSignals);Object.assign(out,k.channels||{});Object.assign(health,k.health||{});}catch(e){warnings.push(`keyless: ${e.message||e}`);}
  return {channels:out,health,warning:warnings.length?warnings.join('; '):null};
}
function preliminaryHeat(signal){
  const c=signal?.channels||{},news=c.news||{},portal=['web','blog','cafe','video'].map(k=>c[k]||{}),gt=c.googleTrends||{};
  return 5*(news.event6||0)+3*(news.count6||0)+1.5*(news.sources6||0)+portal.reduce((a,x)=>a+1.5*(x.count6||0)+2*(x.event6||0),0)+0.8*(gt.score||0);
}
module.exports={collectMember,collectEnrichmentMember,preliminaryHeat,cleanHtml,normalizeTitle,normalizeEventText,summarize,keywordMatch};
