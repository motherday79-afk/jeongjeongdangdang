const {stateWeight,carryIfMissing,missing,STATES}=require('./observation');
function clamp(x,a=0,b=100){return Math.max(a,Math.min(b,x));}
function round1(v){return Math.round(v*10)/10;}
function grade(v){return v>=85?'S':v>=70?'A':v>=55?'B':v>=35?'C':'D';}
function logisticCount(n,k){return 100*(1-Math.exp(-Math.max(0,n)/k));}
function channelMomentum(s={},opts={}){
  const c6=Number(s.count6||0),c24=Number(s.count24||0),c7=Number(s.count7d||0),src=Number(s.sources6||0);
  const hist6=Math.max(0,c7-c24)/24,prev18=Math.max(0,c24-c6)/3,baseline=Math.max(opts.floor??0.7,0.60*hist6+0.40*prev18);
  const rise=(c6+2)/(baseline+2),surge=clamp(100*(1-Math.exp(-Math.max(0,Math.log2(Math.max(1e-6,rise)))/2.1))),volume=logisticCount(c6,opts.volumeK||8),breadth=logisticCount(src,opts.breadthK||3);
  const ageH=Number.isFinite(s.latest)?Math.max(0,(Date.now()-s.latest)/3600000):72,freshness=clamp(100*Math.pow(2,-ageH/(opts.halfLife||4))),accel=clamp(50+28*Math.log2(Math.max(.25,(c6+1)/(prev18+1))));
  const support=(1-Math.exp(-c6/(opts.supportK||5)))*(.55+.45*(1-Math.exp(-src/2))),core=.42*surge+.25*volume+.20*breadth+.13*(.55*freshness+.45*accel);
  return {score:clamp(core*(.38+.62*support)),surge,volume,breadth,freshness,accel,support,rise,baseline};
}
function internalMomentum(s={}){const c=Number(s.count6||0),b=Math.max(.5,Number(s.baseline7d||s.baseline24||0)),rise=(c+2)/(b+2),surge=clamp(100*(1-Math.exp(-Math.max(0,Math.log2(rise))/2))),volume=logisticCount(c,18),score=clamp(.62*surge+.38*volume);return {score:score*(1-Math.exp(-c/8)),surge,volume};}
function surfaceMomentum(cur={},prev={}){const c=Number(cur.surfaceHits||0),p=Number(prev.surfaceHits||0),rise=(c+2)/(p+2),surge=clamp(100*(1-Math.exp(-Math.max(0,Math.log2(rise))/2.2))),level=logisticCount(c,14),fresh=Number(cur.freshHits||0)>0?70:32,event=clamp(22*Number(cur.eventHits||0)),support=1-Math.exp(-c/6);return {score:clamp((.48*surge+.32*level+.12*fresh+.08*event)*(.35+.65*support)),surge,level,fresh,event,rise};}
function blendAvailable(parts=[]){const valid=parts.map(x=>({...x,aw:Number.isFinite(x?.availability)?Math.max(0,x.availability):(x.available===false?0:1)})).filter(x=>Number.isFinite(x?.value)&&x.weight>0&&x.aw>0),w=valid.reduce((a,x)=>a+x.weight*x.aw,0);return w?clamp(valid.reduce((a,x)=>a+x.value*x.weight*x.aw,0)/w):0;}
function weightedBreakdown(parts=[]){const valid=parts.map(x=>({...x,aw:Number.isFinite(x?.availability)?Math.max(0,x.availability):(x.available===false?0:1)})).filter(x=>Number.isFinite(x?.value)&&x.weight>0&&x.aw>0),denom=valid.reduce((a,x)=>a+x.weight*x.aw,0);const contributions={};for(const x of valid){const key=x.key||x.label||'component';contributions[key]=denom?x.value*x.weight*x.aw/denom:0;}return {denom,contributions,total:denom?valid.reduce((a,x)=>a+x.value*x.weight*x.aw,0)/denom:0};}
const STOP=new Set('국회의원 의원 국회 정치 정치권 더불어민주당 민주당 국민의힘 조국혁신당 진보당 개혁신당 무소속 대표 위원장 정부 대통령 대한민국 관련 오늘 최근 대해 위한 통해 하는 했다 한다 있는 없는 기자 뉴스 단독 종합 속보 인터뷰 포토 영상'.split(/\s+/));
function tokens(title=''){return String(title).toLowerCase().replace(/[^0-9a-z가-힣 ]+/g,' ').split(/\s+/).map(x=>x.trim()).filter(x=>x.length>=2&&!STOP.has(x)&&!/^(의원|대표|위원|기자)$/.test(x));}
function buildIssueClusters(signals){
  const articles=new Map();for(const [name,sig] of Object.entries(signals||{})){for(const it of sig.evidenceItems||[]){const key=(it.link||it.title||'').split('?')[0];if(!key)continue;const a=articles.get(key)||{title:it.title||'',source:it.source||'',ts:it.ts||0,members:new Set(),channels:new Set()};a.members.add(name);a.channels.add(it.channel||'');articles.set(key,a);}}
  const grams=new Map();for(const a of articles.values()){const ts=tokens(a.title),terms=new Set(ts);for(let n=2;n<=3;n++)for(let i=0;i<=ts.length-n;i++)terms.add(ts.slice(i,i+n).join(' '));for(const term of terms){if(term.length<3)continue;const g=grams.get(term)||{term,articles:new Set(),sources:new Set(),members:new Map(),latest:0};g.articles.add(a.title);if(a.source)g.sources.add(a.source);g.latest=Math.max(g.latest,a.ts||0);for(const m of a.members)g.members.set(m,(g.members.get(m)||0)+1);grams.set(term,g);}}
  const clusters=[];for(const g of grams.values()){const ac=g.articles.size,sc=g.sources.size;if(ac<3||sc<2)continue;const ageH=g.latest?Math.max(0,(Date.now()-g.latest)/3600000):72,strength=100*(1-Math.exp(-ac/10))*(.55+.45*(1-Math.exp(-sc/4)))*(.75+.25*Math.pow(2,-ageH/6));clusters.push({term:g.term,articles:ac,sources:sc,members:Object.fromEntries(g.members),strength:round1(strength),latest:g.latest});}
  clusters.sort((a,b)=>b.strength-a.strength||b.articles-a.articles);const picked=[];for(const c of clusters){if(picked.some(p=>p.term.includes(c.term)||c.term.includes(p.term)))continue;picked.push(c);if(picked.length>=8)break;}return picked;
}
function automaticCentrality(name,clusters=[]){const vals=[];for(const c of clusters){const mc=Number(c.members?.[name]||0);if(!mc)continue;vals.push(c.strength*Math.sqrt(mc/Math.max(1,c.articles)));}vals.sort((a,b)=>b-a);return clamp((vals[0]||0)+.35*(vals[1]||0)+.15*(vals[2]||0));}
function globalEventCentrality(name,globalNews={}){
  const s=globalNews?.members?.[name]||{},eventTotal=Math.max(1,Number(globalNews.eventArticleCount||0)),eventSourcesTotal=Math.max(1,Number(globalNews.eventSourceCount||0));
  const ec=Number(s.eventCount||0),et=Number(s.eventTitleCount||0),es=Number(s.eventSources||0),bc=Number(s.broadCount||0),bs=Number(s.broadSources||0);
  const eventStrength=(1-Math.exp(-eventTotal/18))*(.55+.45*(1-Math.exp(-eventSourcesTotal/5)));
  const eventPresence=(.50*logisticCount(ec,6)+.24*logisticCount(et,4)+.20*logisticCount(es,4)+.06*clamp(100*Math.sqrt(ec/eventTotal)))*eventStrength;
  const broadPresence=.55*logisticCount(bc,8)+.30*logisticCount(bs,5)+.15*logisticCount(Number(s.broadTitleCount||0),5);
  return clamp(Math.max(eventPresence,.42*broadPresence));
}
function manualEvent(signal={}){const ch=signal.channels||{},all=['news','web','blog','cafe','video','youtube','youtubeHtml','naverSurface','daumSurface','naverView','daumBlog'].map(k=>ch[k]||{}),e=all.reduce((a,x)=>a+Number(x.event6||x.eventHits||0),0),n=all.reduce((a,x)=>a+Number(x.count6||x.surfaceHits||0),0);if(!e)return 0;return clamp(100*(e/Math.max(1,n))*(1-Math.exp(-e/4)));}
function sourceFamilyCount(signal={},traffic={}){
  const ch=signal.channels||{};let n=0;
  if((ch.namePulse?.score||0)>0||(ch.googleTrends?.score||0)>0)n++;
  if((ch.wiki?.count7d||0)>0)n++;
  if((ch.news?.count6||0)>0||(ch.news?.count24||0)>0)n++;
  if(['daumSurface','daumBlog'].some(k=>(ch[k]?.surfaceHits||0)>0)||['web','blog','cafe'].some(k=>(ch[k]?.count6||0)>0))n++;
  if((ch.video?.count6||0)>0||(ch.youtube?.count6||0)>0||(ch.youtubeHtml?.count7d||0)>0||(ch.x?.count6||0)>0)n++;
  if((traffic.count6||0)>=3)n++;return n;
}
function legacyHas(s={}){return Number(s.count6||0)+Number(s.count24||0)+Number(s.count7d||0)+Number(s.surfaceHits||0)+Number(s.score||0)>0;}
function availability(s={},legacy=false){return stateWeight(s,legacy||legacyHas(s));}
function memoryFactor(key){if(key==='namePulse')return .96;if(key==='wiki')return .78;if(key==='news')return .58;if(['daumSurface','daumBlog'].includes(key))return .66;return .60;}
const RETIRED_CHANNELS=new Set(['naverSearchTrend','naverBlogApi','naverCafeApi','naverWebApi','naverSurface','naverView']);
function effectiveChannels(current={},previous={}){
  const out={},keys=new Set([...Object.keys(previous||{}),...Object.keys(current||{}),'namePulse','news','googleTrends','daumSurface','wiki','youtube','youtubeHtml','x']);
  for(const key of keys){if(RETIRED_CHANNELS.has(key))continue;let cur=current?.[key];const prev=previous?.[key];if(!cur)cur=missing(key,'not collected in this refresh',key.toLowerCase().includes('api')||key.toLowerCase().includes('surface')?'surface':'count');out[key]=carryIfMissing(cur,prev,memoryFactor(key));}
  return out;
}
function computeMember(signal={},traffic={},eventSignals={},previousSignal={}){
  const pch=previousSignal?.channels||{},ch=effectiveChannels(signal.channels||{},pch),effectiveSignal={...signal,channels:ch};
  const news=channelMomentum(ch.news||{},{volumeK:9,halfLife:3.5}),wiki=channelMomentum(ch.wiki||{},{volumeK:45,breadthK:1,halfLife:8,supportK:30,floor:Math.max(.7,Number(ch.wiki?.baseline6||0))}),internal=internalMomentum(traffic||{});
  const daumSurface=surfaceMomentum(ch.daumSurface||{},pch.daumSurface||{}),daumBlog=surfaceMomentum(ch.daumBlog||{},pch.daumBlog||{});
  const namePulse=clamp(Number(ch.namePulse?.score||0)),googleTrend=clamp(Number(ch.googleTrends?.score||0));
  const searchSurface=Math.max(daumSurface.score,.75*daumBlog.score);
  const dynamicSearch=blendAvailable([
    {value:googleTrend,weight:.28,availability:availability(ch.googleTrends)},
    {value:wiki.score,weight:.30,availability:availability(ch.wiki)},
    {value:internal.score,weight:.17,availability:(traffic.count6||traffic.baseline7d)?1:0},
    {value:searchSurface,weight:.25,availability:Math.max(availability(ch.daumSurface),availability(ch.wiki))}
  ]);
  const dynamicSearchAvail=Math.max(availability(ch.googleTrends),availability(ch.wiki),(traffic.count6||traffic.baseline7d)?1:0,availability(ch.daumSurface));
  const pulseAvail=availability(ch.namePulse),searchInterest=clamp(pulseAvail>0?.40*namePulse+(dynamicSearchAvail>0?.60*dynamicSearch:0):dynamicSearch);
  const web=channelMomentum(ch.web||{},{volumeK:8,halfLife:5}),blog=channelMomentum(ch.blog||{},{volumeK:7,halfLife:5}),cafe=channelMomentum(ch.cafe||{},{volumeK:7,halfLife:5}),portalApi=blendAvailable([{value:web.score,weight:.34,availability:availability(ch.web)},{value:blog.score,weight:.36,availability:availability(ch.blog)},{value:cafe.score,weight:.30,availability:availability(ch.cafe)}]);
  const kvideo=channelMomentum(ch.video||{},{volumeK:6,halfLife:5}),yt=channelMomentum(ch.youtube||{},{volumeK:5,halfLife:4}),yth=channelMomentum(ch.youtubeHtml||{},{volumeK:5,halfLife:4}),xx=channelMomentum(ch.x||{},{volumeK:40,breadthK:1,halfLife:3});
  const portalSocial=blendAvailable([{value:portalApi,weight:.42,availability:Math.max(availability(ch.web),availability(ch.blog),availability(ch.cafe))},{value:daumSurface.score,weight:.22,availability:availability(ch.daumSurface)},{value:daumBlog.score,weight:.12,availability:availability(ch.daumBlog)},{value:kvideo.score,weight:.06,availability:availability(ch.video)},{value:Math.max(yt.score,yth.score),weight:.14,availability:Math.max(availability(ch.youtube),availability(ch.youtubeHtml))},{value:xx.score,weight:.04,availability:availability(ch.x)}]);
  const mEvent=manualEvent(effectiveSignal),autoEvent=Number(eventSignals.auto||0),globalEvent=Number(eventSignals.global||0),event=globalEvent>0?clamp(.58*globalEvent+.25*autoEvent+.17*mEvent):clamp(Math.max(autoEvent,.65*mEvent+.35*autoEvent));
  const freshPool=[[news,ch.news],[wiki,ch.wiki],[web,ch.web],[blog,ch.blog],[cafe,ch.cafe],[kvideo,ch.video],[yt,ch.youtube],[yth,ch.youtubeHtml],[xx,ch.x]].filter(([x,raw])=>x&&Number.isFinite(x.freshness)&&availability(raw)>0&&((raw?.count7d||0)>0||(raw?.count24||0)>0||(raw?.count6||0)>0)).map(([x])=>x);
  const surfaceFresh=[[daumSurface,ch.daumSurface],[daumBlog,ch.daumBlog]].filter(([x,raw])=>x&&Number.isFinite(x.fresh)&&availability(raw)>0&&((raw?.surfaceHits||0)>0)).map(([x])=>({freshness:x.fresh,accel:x.surge})),allFresh=[...freshPool,...surfaceFresh];
  const freshness=allFresh.length?clamp(allFresh.reduce((a,x)=>a+Number(x.freshness||0),0)/allFresh.length):0,accel=allFresh.length?clamp(allFresh.reduce((a,x)=>a+Number(x.accel||0),0)/allFresh.length):0,freshAccel=clamp(.55*freshness+.45*accel);
  const searchAvail=Math.max(availability(ch.namePulse),availability(ch.googleTrends),availability(ch.wiki),availability(ch.daumSurface)),newsAvail=availability(ch.news),socialAvail=Math.max(availability(ch.daumSurface),availability(ch.web),availability(ch.blog),availability(ch.cafe),availability(ch.youtube),availability(ch.youtubeHtml),availability(ch.x)),freshAvail=Math.max(newsAvail,socialAvail,availability(ch.wiki));
  const rawParts=[{key:'search',value:searchInterest,weight:.28,availability:searchAvail},{key:'news',value:news.score,weight:.22,availability:newsAvail},{key:'social',value:portalSocial,weight:.18,availability:socialAvail},{key:'event',value:event,weight:.24,availability:1},{key:'fresh',value:freshAccel,weight:.08,availability:freshAvail}],rawBreakdown=weightedBreakdown(rawParts),preCapRaw=clamp(rawBreakdown.total);
  const families=sourceFamilyCount(effectiveSignal,traffic),cap=[28,45,66,82,92,97,100][Math.min(6,families)]||28,raw=Math.min(preCapRaw,cap);
  const observedChannels=Object.values(ch).filter(x=>x?.observation?.state===STATES.OBSERVED||x?.observation?.state===STATES.ZERO).length,coreKeys=['namePulse','news'],coreMissing=coreKeys.filter(k=>ch[k]?.observation?.state===STATES.MISSING&&!ch[k]?.observation?.carried),coreCarried=coreKeys.filter(k=>ch[k]?.observation?.carried),collectionStatus=coreMissing.length>=2?'POOR':(coreMissing.length===1||coreCarried.length?'NEUTRAL':'GOOD'),missingChannels=coreMissing.length,carriedChannels=coreCarried.length;
  const evidenceConfidence=clamp(18+12*families+3*Math.min(10,observedChannels)-7*missingChannels+2*carriedChannels+6*(globalEvent>0));
  const audit={preCapRaw:round1(preCapRaw),cap:round1(cap),capApplied:preCapRaw>cap+1e-9,componentValues:{search:round1(searchInterest),news:round1(news.score),social:round1(portalSocial),event:round1(event),fresh:round1(freshAccel)},componentAvailability:{search:round1(searchAvail*100),news:round1(newsAvail*100),social:round1(socialAvail*100),event:100,fresh:round1(freshAvail*100)},componentContributions:Object.fromEntries(Object.entries(rawBreakdown.contributions).map(([k,v])=>[k,round1(v)])),sensorScores:{namePulse:round1(namePulse*availability(ch.namePulse)),googleTrend:round1(googleTrend*availability(ch.googleTrends)),wiki:round1(wiki.score*availability(ch.wiki)),searchSurface:round1(searchSurface*Math.max(availability(ch.daumSurface),availability(ch.wiki))),portalApi:round1(portalApi*Math.max(availability(ch.web),availability(ch.blog),availability(ch.cafe))),youtube:round1(Math.max(yt.score,yth.score)*Math.max(availability(ch.youtube),availability(ch.youtubeHtml))),x:round1(xx.score*availability(ch.x)),internal:round1(internal.score*((traffic.count6||traffic.baseline7d)?1:0))},eventScores:{manual:round1(mEvent),auto:round1(autoEvent),global:round1(globalEvent)},namePulse:{score:round1(namePulse),monthlyPcQcCnt:Math.round(Number(ch.namePulse?.monthlyPcQcCnt||0)),monthlyMobileQcCnt:Math.round(Number(ch.namePulse?.monthlyMobileQcCnt||0)),monthlyTotalQcCnt:Math.round(Number(ch.namePulse?.monthlyTotalQcCnt||0)),matchedKeyword:ch.namePulse?.matchedKeyword||null}};
  return {raw,searchInterest,news:news.score,portalSocial,event,freshAccel,families,evidenceConfidence,effectiveChannels:ch,collection:{status:collectionStatus,observedChannels,missingChannels,carriedChannels,coreMissing},audit,details:{news,wiki,internal,daumSurface,daumBlog,googleTrend,web,blog,cafe,kvideo,yt,yth,xx,mEvent,autoEvent,globalEvent}};
}

function makeMetric(label,v){v=round1(clamp(v));return [label,grade(v),v];}
function quantile(sorted,q){if(!sorted.length)return 0;const pos=(sorted.length-1)*clamp(q,0,1),lo=Math.floor(pos),hi=Math.ceil(pos);if(lo===hi)return sorted[lo];return sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo);}
function relativeDisplay(value,values=[],opts={}){
  const v=Number(value);if(!Number.isFinite(v)||v<=0)return 0;
  const positive=values.map(Number).filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);if(!positive.length)return 0;
  let lower=0,equal=0;for(const x of positive){if(x<v)lower++;else if(Math.abs(x-v)<1e-9)equal++;}
  const pct=positive.length===1?1:clamp((lower+Math.max(1,equal)/2-.5)/(positive.length-1),0,1);
  const p90=Math.max(1e-9,quantile(positive,.90));
  const intensity=Math.sqrt(clamp(v/p90,0,1));
  const pw=Number.isFinite(opts.percentileWeight)?opts.percentileWeight:.72,iw=1-pw;
  const floor=Number.isFinite(opts.floor)?opts.floor:18,top=Number.isFinite(opts.top)?opts.top:96;
  return round1(clamp(floor+(top-floor)*(pw*pct+iw*intensity)));
}
function computeSnapshot(roster,signals,context={},previous=null,trafficSignals={}){
  const active=roster.filter(x=>x.id!==300&&x.party!=='공석'),clusters=buildIssueClusters(signals),globalNews=context.globalNews||{};
  const comparisonCompatible=!previous||previous.modelVersion==='name-pulse-v1';
  let scored=active.map(m=>{const sig=signals[m.name]||{},traffic=trafficSignals[m.name]||{},auto=automaticCentrality(m.name,clusters),glob=globalEventCentrality(m.name,globalNews),prevSig=previous?.members?.find?.(p=>p.name===m.name)?.signal||{},c=computeMember(sig,traffic,{auto,global:glob},prevSig);sig.channels=c.effectiveChannels;const ch=sig.channels||{},tiebreak=(ch.news?.count24||0)*1e-5+(ch.news?.sources24||0)*1e-6-m.id*1e-10;return {member:m,signal:sig,traffic,components:c,sortScore:c.raw+tiebreak};}).sort((a,b)=>b.sortScore-a.sortScore);
  const pools={
    score:scored.map(x=>x.components.raw),
    search:scored.map(x=>x.components.searchInterest),
    news:scored.map(x=>x.components.news),
    social:scored.map(x=>x.components.portalSocial),
    event:scored.map(x=>x.components.event),
    fresh:scored.map(x=>x.components.freshAccel)
  };
  scored=scored.map((x,i)=>{const display=relativeDisplay(x.components.raw,pools.score,{floor:12,top:98,percentileWeight:.76});const prev=previous?.members?.find?.(p=>p.name===x.member.name),change6h=comparisonCompatible&&Number.isFinite(prev?.rank)?prev.rank-(i+1):null,metrics=[makeMetric('대중 관심도',relativeDisplay(x.components.searchInterest,pools.search)),makeMetric('뉴스 급상승',relativeDisplay(x.components.news,pools.news)),makeMetric('포털·SNS 확산',relativeDisplay(x.components.portalSocial,pools.social)),makeMetric('이슈 중심성',relativeDisplay(x.components.event,pools.event)),makeMetric('신선도·가속도',relativeDisplay(x.components.freshAccel,pools.fresh))],channels=x.signal.channels||{},sourceBadges=[];
    if((channels.namePulse?.monthlyTotalQcCnt||0)>0)sourceBadges.push('NAVER Name Pulse');if((channels.googleTrends?.score||0)>0)sourceBadges.push('Google Trends');if((channels.wiki?.count7d||0)>0)sourceBadges.push('Wikipedia');if((channels.news?.count6||0)>0)sourceBadges.push('뉴스');if((x.components.details.globalEvent||0)>0)sourceBadges.push('이슈뉴스');if((channels.bigKinds?.count7d||0)>0||(channels.bigKinds?.relatedWords||[]).length)sourceBadges.push('BIG KINDS');if((channels.daumSurface?.surfaceHits||0)>0||(channels.daumBlog?.surfaceHits||0)>0)sourceBadges.push('Daum HTML');if(['web','blog','cafe'].some(k=>(channels[k]?.count6||0)>0))sourceBadges.push('포털API');if((channels.video?.count6||0)>0)sourceBadges.push('동영상');if((channels.youtube?.count6||0)>0)sourceBadges.push('YouTube API');if((channels.youtubeHtml?.count7d||0)>0)sourceBadges.push('YouTube HTML');if((channels.x?.count6||0)>0)sourceBadges.push('X');if((x.traffic.count6||0)>=3)sourceBadges.push('정정당당');
    return {id:x.member.id,name:x.member.name,party:x.member.party,region:x.member.region,constituency:x.member.constituency,rank:i+1,score:display,rawScore:round1(x.components.raw),grade:grade(display),change6h,metrics,sourceCount:x.components.families,evidenceConfidence:round1(x.components.evidenceConfidence),collection:x.components.collection,audit:x.components.audit,sourceBadges,eventLabel:context.eventTitle||'현재 주요 정치 이슈',latest:channels.news?.latest?new Date(channels.news.latest).toISOString():null,signal:{count6:channels.news?.count6||0,count24:channels.news?.count24||0,count7d:channels.news?.count7d||0,sources6:channels.news?.sources6||0,event6:channels.news?.event6||0,headlines:channels.news?.headlines||[],bigKindsHeadlines:channels.bigKinds?.headlines||[],bigKindsRelatedWords:channels.bigKinds?.relatedWords||[],bigKindsIncidents:channels.bigKinds?.incidents||[],channels,traffic:x.traffic,autoEvent:round1(x.components.details.autoEvent),globalEvent:round1(x.components.details.globalEvent),manualEvent:round1(x.components.details.mEvent)}};});
  scored.push({id:300,name:'강릉시 국회의원 공석',party:'공석',region:'강원',constituency:'강원 강릉시',rank:300,score:0,rawScore:0,grade:'D',change6h:0,metrics:[['대중 관심도','D',0],['뉴스 급상승','D',0],['포털·SNS 확산','D',0],['이슈 중심성','D',0],['신선도·가속도','D',0]],sourceCount:0,evidenceConfidence:0,sourceBadges:[],eventLabel:'공석',signal:{}});
  const okState=s=>['READY','OK','OK_ROBOTS_DISALLOW','ADVISORY_DISALLOW','ADVISORY_UNKNOWN','DEGRADED'].includes(s||''),configured={googleNews:true,naverNamePulse:Boolean(process.env.NAVER_AD_ACCESS_LICENSE&&process.env.NAVER_AD_SECRET_KEY&&process.env.NAVER_AD_CUSTOMER_ID),googleTrends:true,wikimedia:true,bigKinds:Boolean(process.env.BIGKINDS_ACCESS_KEY),daumHtml:okState(context.sourceHealth?.daumHtml?.state),youtubeHtml:okState(context.sourceHealth?.youtubeHtml?.state),naverNews:Boolean(process.env.NAVER_API_HUB_CLIENT_ID&&process.env.NAVER_API_HUB_CLIENT_SECRET),kakao:Boolean(process.env.KAKAO_REST_API_KEY),youtube:Boolean(process.env.YOUTUBE_API_KEY),x:Boolean(process.env.X_BEARER_TOKEN),internal:true,globalPolitics:true};
  const top30=scored.slice(0,30),allActive=scored.slice(0,299),namePulseObserved=allActive.filter(x=>['OBSERVED','ZERO'].includes(x.signal?.channels?.namePulse?.observation?.state)).length,namePulseSignal=allActive.filter(x=>Number(x.signal?.channels?.namePulse?.monthlyTotalQcCnt||0)>0).length,bigKindsObserved=allActive.filter(x=>['OBSERVED','ZERO'].includes(x.signal?.channels?.bigKinds?.observation?.state)).length;
  const statusCounts={GOOD:allActive.filter(x=>x.collection?.status==='GOOD').length,NEUTRAL:allActive.filter(x=>x.collection?.status==='NEUTRAL').length,POOR:allActive.filter(x=>x.collection?.status==='POOR').length};
  const quality={configuredSources:configured,namePulseCoverage:namePulseObserved,namePulseSignalCoverage:namePulseSignal,bigKindsCoverage:bigKindsObserved,top30MultiSource:top30.filter(x=>x.sourceCount>=2).length,top30ThreePlus:top30.filter(x=>x.sourceCount>=3).length,top30SingleSource:top30.filter(x=>x.sourceCount<=1).length,collectionStatus:statusCounts,warning:''};if(quality.top30SingleSource>10)quality.warning='상위권 다수가 단일 원천입니다. 이 스냅샷은 게시보다 원천 상태 점검이 우선입니다.';if(configured.naverNamePulse&&namePulseObserved<285)quality.warning=[quality.warning,`NAVER Name Pulse 실제 수집 실패 포함 처리 ${namePulseObserved}/299`].filter(Boolean).join(' · ');
  const sourceSummary=Object.entries(configured).filter(([,on])=>on).map(([k])=>k);return {version:'NOW Rank v1.12 Evidence Clean + BIG KINDS',modelVersion:'name-pulse-v1',displayScale:'relative-v1.6.1',comparisonCompatible,timestamp:new Date().toISOString(),cadenceHours:6,event:{title:context.eventTitle||'',keywords:context.eventKeywords||[]},configuredSources:configured,sourceSummary,sourceHealth:context.sourceHealth||{},globalNews:{eventArticles:globalNews.eventArticleCount||0,eventSources:globalNews.eventSourceCount||0,broadArticles:globalNews.broadArticleCount||0,broadSources:globalNews.broadSourceCount||0,warnings:globalNews.warnings||[]},detectedIssues:clusters.slice(0,5),quality,members:scored};
}
module.exports={computeSnapshot,computeMember,buildIssueClusters,channelMomentum,grade,clamp,globalEventCentrality,relativeDisplay};
