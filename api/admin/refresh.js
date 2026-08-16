const crypto=require('crypto');
const {requireAdmin}=require('../../lib/auth');
const store=require('../../lib/store');
const {collectMember,collectEnrichmentMember,preliminaryHeat,collectGlobalPolitics}=require('../../lib/collector');
const {computeSnapshot}=require('../../lib/score');
const {readTrafficSignals}=require('../../lib/traffic');
const {collectGlobalKeyless}=require('../../lib/keyless');
const {mark,STATES}=require('../../lib/observation');
const {credentials:searchAdCreds,queryKeywords,searchScaleScore}=require('../../lib/naver_searchad');
const {credentials:bigKindsCreds}=require('../../lib/bigkinds');
const {getAllRoster,activeRoster,counts:rosterCounts}=require('../../lib/political_roster');
const roster=getAllRoster();
const {memberKey}=require('../../lib/member_key');
const {titleTerm}=require('../../lib/political_entity');

const DRAFT_TTL=12*60*60;
function id(){return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;}
function body(req){return req.body||{};}
function active(){return activeRoster();}

const PERF_SIGNAL_CACHE_KEY='jjdd:refresh:signals:last:v1';
const PERF_SIGNAL_CACHE_TTL=7*24*3600;
const QUICK_COLLECT_MAX=Math.max(60,Math.min(180,Number(process.env.QUICK_REFRESH_COLLECT_MAX)||110));
const QUICK_ENRICH_TOP_N=Math.max(20,Math.min(70,Number(process.env.QUICK_ENRICH_TOP_N)||45));
const NAME_PULSE_REFRESH_MS=Math.max(2,Math.min(48,Number(process.env.NAME_PULSE_REFRESH_HOURS)||12))*3600000;
function copy(v){try{return JSON.parse(JSON.stringify(v));}catch(_){return v;}}
function previousMap(previous){return new Map((previous?.members||[]).map(x=>[Number(x.id),x]));}
function snapshotSignal(row){
  const sig=row?.signal||{};if(!sig.channels||typeof sig.channels!=='object')return null;
  return {channels:copy(sig.channels),evidenceItems:[...(sig.headlines||[]),...(sig.headlineCandidates||[])].slice(0,40),health:{},warning:null,carriedFrom:row?.latest||row?.timestamp||null};
}
function overlayFreshTrend(signal,k,globalSignals){
  signal=signal||{channels:{},evidenceItems:[]};signal.channels=signal.channels||{};
  const trend=globalSignals?.trends?.signals?.[k]||{provider:'google-trends-rising',score:0,traffic:0,exact:false,latest:null,title:null};
  signal.channels.googleTrends=mark(trend,'google-trends-rising',(trend?.score||0)>0?STATES.OBSERVED:STATES.ZERO);
  return signal;
}
function quickCollectionPlan(members,seedSignals,previous,globalSignals,globalNews){
  if(!previous?.members?.length&&!Object.keys(seedSignals||{}).length)return members.map(memberKey);
  const prev=previousMap(previous),scores=new Map();
  const bump=(k,v)=>scores.set(k,Math.max(scores.get(k)||-1e9,v));
  for(const m of members){const k=memberKey(m),r=prev.get(Number(m.id));if(!seedSignals[k])bump(k,2000);const rank=Number(r?.overallRank||r?.rank||9999);if(rank<=40)bump(k,1200-rank);const mv=Math.abs(Number(r?.changeOverallRefresh??r?.changeRefresh??0));if(mv>=5)bump(k,900+Math.min(150,mv*5));}
  for(const m of members){const k=memberKey(m),t=Number(globalSignals?.trends?.signals?.[k]?.score||0);if(t>0)bump(k,1100+Math.min(100,t));const g=globalNews?.members?.[k]||{},event=Number(g.eventCount||0)+Number(g.eventTitleCount||0)*2,broad=Number(g.broadTitleCount||0)+Math.min(3,Number(g.broadCount||0));if(event>0)bump(k,1150+event*8);else if(broad>0)bump(k,850+broad*5);}
  const rotationSize=32,rotationStart=(Math.floor(Date.now()/(3*3600000))*rotationSize)%Math.max(1,members.length);const rotation=[...members.slice(rotationStart),...members.slice(0,rotationStart)].slice(0,rotationSize);rotation.forEach((m,i)=>bump(memberKey(m),300-i));
  const missing=members.map(memberKey).filter(k=>!seedSignals[k]);
  const ranked=[...scores.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
  const cap=Math.max(QUICK_COLLECT_MAX,missing.length);return [...new Set([...missing,...ranked])].slice(0,cap);
}
function namePulsePlan(members,seedSignals,previous,collectKeys,mode,configured){
  if(!configured)return [];
  if(mode==='full')return members.map(memberKey);
  const previousAt=Date.parse(previous?.timestamp||previous?.publishedAt||0);const recent=Number.isFinite(previousAt)&&Date.now()-previousAt<NAME_PULSE_REFRESH_MS;
  const missing=members.map(memberKey).filter(k=>!seedSignals[k]?.channels?.namePulse);
  if(recent&&!missing.length)return [];
  const prev=previousMap(previous),top=members.filter(m=>Number(prev.get(Number(m.id))?.overallRank||9999)<=70).map(memberKey);
  const rotationSize=28,rotationStart=(Math.floor(Date.now()/NAME_PULSE_REFRESH_MS)*rotationSize)%Math.max(1,members.length),rotation=[...members.slice(rotationStart),...members.slice(0,rotationStart)].slice(0,rotationSize).map(memberKey);
  return [...new Set([...missing,...collectKeys,...top,...rotation])].slice(0,140);
}

const ADMIN_SENSOR_LABELS={
  namePulse:'NAVER Name Pulse',googleTrends:'Google 급상승',news:'뉴스',bigKinds:'BIG KINDS',wiki:'Wikipedia',
  daumSurface:'Daum HTML',daumBlog:'Daum 블로그',web:'포털 웹',blog:'포털 블로그',cafe:'포털 카페',video:'동영상',
  youtube:'YouTube API',youtubeHtml:'YouTube HTML',x:'X'
};
function compactSensor(key,s={}){
  const o=s?.observation||{};const out={key,label:ADMIN_SENSOR_LABELS[key]||key,state:o.state||'UNKNOWN',provider:s?.provider||o.provider||'',carried:Boolean(o.carried)};
  if(o.detail)out.detail=String(o.detail).slice(0,120);if(Number.isFinite(Number(o.carryFactor)))out.carryFactor=Math.round(Number(o.carryFactor)*100)/100;
  for(const k of ['score','level7d','level30d','recent3','prior14','momentum','count6','count24','count7d','sources6','sources24','event6','title6','surfaceHits','freshHits','eventHits','totalCount','views6','views24','views7d','monthlyPcQcCnt','monthlyMobileQcCnt','monthlyTotalQcCnt']){
    const v=Number(s?.[k]);if(Number.isFinite(v))out[k]=Math.round(v*10)/10;
  }
  if(s?.latest)out.latest=s.latest;
  for(const k of ['queryTerm','matchedKeyword','qualificationMode'])if(s?.[k])out[k]=String(s[k]).slice(0,120);
  if(Number.isFinite(Number(s?.confidenceFactor)))out.confidenceFactor=Math.round(Number(s.confidenceFactor)*100)/100;
  return out;
}
function adminMemberView(x){
  const ch=x?.signal?.channels||{};const sensors=Object.keys(ADMIN_SENSOR_LABELS).map(k=>compactSensor(k,ch[k]||{}));
  return {id:x.id,entityType:x.entityType||'assembly',office:x.office||'국회의원',jurisdiction:x.jurisdiction||x.constituency||'',name:x.name,party:x.party,region:x.region,constituency:x.constituency,photoVerified:x.photoVerified===true,officialPhoto:x.photoVerified===true?x.officialPhoto||null:null,officialProfileUrl:x.officialProfileUrl||null,overallRank:x.overallRank,rank:x.rank,categoryRank:x.categoryRank??x.rank,score:x.score,rawScore:x.rawScore,grade:x.grade,previousRank:x.previousRank,previousOverallRank:x.previousOverallRank,changeRefresh:x.changeRefresh,changeOverallRefresh:x.changeOverallRefresh,change6h:x.change6h,searchRank:x.searchRank,searchScore:x.searchScore,searchRaw:x.searchRaw,mediaRank:x.mediaRank,mediaScore:x.mediaScore,mediaRaw:x.mediaRaw,sourceCount:x.sourceCount,evidenceConfidence:x.evidenceConfidence,collection:x.collection||{},sourceBadges:x.sourceBadges||[],metrics:x.metrics||[],audit:x.audit||{},rankHeadline:x.rankHeadline||'',rankHeadlineSource:x.rankHeadlineSource||'',rankHeadlineAt:x.rankHeadlineAt||null,rankHeadlineKind:x.rankHeadlineKind||'',signal:{count6:x.signal?.count6||0,count24:x.signal?.count24||0,count7d:x.signal?.count7d||0,sources6:x.signal?.sources6||0,event6:x.signal?.event6||0,autoEvent:x.signal?.autoEvent||0,globalEvent:x.signal?.globalEvent||0,manualEvent:x.signal?.manualEvent||0,bigKindsRelatedWords:(x.signal?.bigKindsRelatedWords||[]).slice(0,10),headlines:(x.signal?.headlines||[]).slice(0,5).map(h=>({title:h.title||'',source:h.source||'',ts:h.ts||null})),bigKindsHeadlines:(x.signal?.bigKindsHeadlines||[]).slice(0,5).map(h=>({title:h.title||'',source:h.source||'',ts:h.ts||null}))},sensors};
}

function aggregateSourceHealth(draft){
  const base={...(draft.sourceHealth||{})};
  const names=Object.keys(draft.signals||{});
  for(const key of ['daumHtml','wiki','daumBlog','youtubeHtml','bigKinds']){
    const rows=names.map(n=>draft.signals[n]?.health?.[key]).filter(Boolean);
    if(!rows.length)continue;
    const counts={};for(const r of rows)counts[r.state]=(counts[r.state]||0)+1;
    const blocked=(counts.BLOCKED||0)+(counts.ROBOTS_BLOCKED||0),errors=(counts.ERROR||0)+(counts.ROBOTS_UNAVAILABLE||0),ok=(counts.OK||0)+(counts.READY||0),tested=rows.length;
    let state='OK';if(blocked===tested)state='BLOCKED';else if(blocked||errors)state='DEGRADED';else if(!ok)state='EMPTY';
    base[key]={state,detail:`tested ${tested} · ok ${ok} · blocked ${blocked} · error ${errors}`,counts};
  }
  return base;
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});
  if(!requireAdmin(req,res))return;
  const b=body(req),action=b.action||'start';
  try{
    if(action==='start'){
      const members=active(),draftId=id(),mode=b.mode==='full'?'full':'quick',eventTitle=String(b.eventTitle||process.env.DEFAULT_EVENT_TITLE||'현재 주요 정치 이슈').trim();
      const eventKeywords=(Array.isArray(b.eventKeywords)?b.eventKeywords:String(b.eventKeywords||'').split(',')).map(x=>String(x).trim()).filter(Boolean).slice(0,12);
      const [globalSignals,globalNews,previous,perfCache]=await Promise.all([collectGlobalKeyless(members),collectGlobalPolitics(members,eventTitle,eventKeywords),store.getJSON('jjdd:current').catch(()=>null),store.getJSON(PERF_SIGNAL_CACHE_KEY).catch(()=>null)]);
      const prevMap=previousMap(previous),seedSignals={};
      for(const m of members){const k=memberKey(m),cached=perfCache?.signals?.[k],fromCurrent=snapshotSignal(prevMap.get(Number(m.id))),base=cached?.channels?copy(cached):fromCurrent;if(base?.channels)seedSignals[k]=overlayFreshTrend(base,k,globalSignals);}
      const collectKeys=mode==='full'?members.map(memberKey):quickCollectionPlan(members,seedSignals,previous,globalSignals,globalNews);
      const npConfigured=Boolean(searchAdCreds().configured),npKeys=namePulsePlan(members,seedSignals,previous,collectKeys,mode,npConfigured),npSignals={};
      for(const m of members){const k=memberKey(m),x=seedSignals[k]?.channels?.namePulse;if(x)npSignals[k]=copy(x);}
      const draft={id:draftId,mode,status:'collecting',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),eventTitle,eventKeywords,signals:seedSignals,collectKeys,enrichmentNames:[],enrichmentDone:0,globalSignals,globalNews,sourceHealth:globalSignals.health||{},performance:{mode,rosterTotal:members.length,collectTotal:collectKeys.length,carriedTotal:Math.max(0,members.length-collectKeys.length),cacheSavedAt:perfCache?.savedAt||null},namePulse:{configured:npConfigured,signals:npSignals,keys:npKeys,processed:0,total:npKeys.length}};
      await store.setJSON(`jjdd:draft:${draftId}`,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,total:members.length,collectTotal:collectKeys.length,carriedTotal:draft.performance.carriedTotal,nextOffset:0,mode,eventTitle,eventKeywords,sourceHealth:draft.sourceHealth,trendingMatches:Object.values(globalSignals.trends?.signals||{}).filter(x=>(x.score||0)>0).length,namePulse:{configured:draft.namePulse.configured,total:draft.namePulse.total,carried:Math.max(0,Object.keys(npSignals).length-draft.namePulse.total)},bigKinds:{configured:Boolean(bigKindsCreds().configured)},globalNews:{eventArticles:globalNews.eventArticleCount,eventSources:globalNews.eventSourceCount,broadArticles:globalNews.broadArticleCount,broadSources:globalNews.broadSourceCount,warnings:globalNews.warnings}});
    }
    const draftId=String(b.draftId||''),key=`jjdd:draft:${draftId}`,draft=await store.getJSON(key);
    if(!draft)return res.status(404).json({ok:false,error:'Refresh draft를 찾을 수 없습니다. 다시 시작해주세요.'});

    if(action==='name-pulse-batch'){
      const members=active(),memberMap=new Map(members.map(m=>[memberKey(m),m])),offset=Math.max(0,Number(b.offset)||0),size=Math.min(20,Math.max(1,Number(b.size)||14)),keys=(draft.namePulse?.keys||members.map(memberKey)),batch=keys.slice(offset,offset+size).map(k=>memberMap.get(k)).filter(Boolean);
      if(!draft.namePulse)draft.namePulse={configured:Boolean(searchAdCreds().configured),signals:{},processed:0,total:members.length};
      if(!draft.namePulse.configured){
        for(const m of batch)draft.namePulse.signals[memberKey(m)]=mark({provider:'naver-search-ads-keywordstool',score:0,monthlyPcQcCnt:0,monthlyMobileQcCnt:0,monthlyTotalQcCnt:0},'naver-search-ads-keywordstool',STATES.MISSING,'NAVER Search Ads credentials not configured');
      }else{
        // v2.2.3: 지방단체장 Name Pulse는 직책 결합 키워드를 우선 조회하고,
        // 해당 키워드가 NAVER 광고 키워드 DB에 없을 때만 '통합 roster에서 이름이 유일한 인물'에 한해
        // 이름 단독 검색량을 보조값으로 사용한다. 동명이인은 이름 단독 fallback을 절대 사용하지 않는다.
        const localType=m=>['metro','local'].includes(String(m.entityType||'assembly'));
        const primaryTerms=batch.map(m=>localType(m)?`${m.name}${String(titleTerm(m)||'').replace(/\s+/g,'')}`:m.name);
        const primaryRows=await queryKeywords(primaryTerms);
        const fallbackIndexes=[];
        primaryRows.forEach((row,i)=>{const m=batch[i];if(localType(m)&&row?.ok&&!row.found&&!m.ambiguousName)fallbackIndexes.push(i);});
        const fallbackRows=fallbackIndexes.length?await queryKeywords(fallbackIndexes.map(i=>batch[i].name)):[];
        const fallbackByIndex=new Map(fallbackIndexes.map((idx,j)=>[idx,fallbackRows[j]]));
        primaryRows.forEach((first,i)=>{
          const member=batch[i],k=memberKey(member),isLocal=localType(member),fallback=fallbackByIndex.get(i);
          const row=(first?.ok&&first.found)?first:(fallback?.ok&&fallback.found?fallback:first);
          const usedFallback=Boolean(isLocal&&fallback?.ok&&fallback.found&&!(first?.found));
          const queryTerm=usedFallback?member.name:primaryTerms[i];
          if(row?.ok){
            const total=row.found?Math.max(0,Number(row.monthlyTotalQcCnt)||0):0;
            const ambiguous=Boolean(member.ambiguousName);
            const confidenceFactor=usedFallback?0.72:1;
            const score=ambiguous?0:Math.round(searchScaleScore(total)*confidenceFactor*10)/10;
            const detail=ambiguous?'동명이인 · 이름 단독 검색량 인물별 반영 제외':usedFallback?'직책 결합 키워드 미반환 · roster 내 유일 이름 검색량을 72% 신뢰도로 보조 반영':(row.found?'직책/이름 정확 키워드 관측':'API 정상 · 정확 키워드 미반환(검색량 0)');
            draft.namePulse.signals[k]=mark({provider:'naver-search-ads-keywordstool',score,matchedKeyword:row.found?(row.matchedKeyword||queryTerm):null,queryTerm,qualificationMode:usedFallback?'unique-name-fallback':(isLocal?'office-qualified':'name-exact'),confidenceFactor,monthlyPcQcCnt:ambiguous?0:(row.found?(Number(row.monthlyPcQcCnt)||0):0),monthlyMobileQcCnt:ambiguous?0:(row.found?(Number(row.monthlyMobileQcCnt)||0):0),monthlyTotalQcCnt:ambiguous?0:total,sharedNameMonthlyTotalQcCnt:ambiguous?total:null,ambiguousName:ambiguous,found:Boolean(row.found),fetchedAt:row.fetchedAt||new Date().toISOString()},'naver-search-ads-keywordstool',ambiguous?STATES.ZERO:(total>0?STATES.OBSERVED:STATES.ZERO),detail);
          }else{
            draft.namePulse.signals[k]=mark({provider:'naver-search-ads-keywordstool',score:0,monthlyPcQcCnt:0,monthlyMobileQcCnt:0,monthlyTotalQcCnt:0,found:false,queryTerm},'naver-search-ads-keywordstool',STATES.MISSING,row?.error||'Name Pulse request failed');
          }
        });
      }
      const nextOffset=offset+batch.length;draft.namePulse.processed=nextOffset;draft.updatedAt=new Date().toISOString();
      for(const m of batch){const k=memberKey(m);draft.signals[k]=draft.signals[k]||{channels:{},evidenceItems:[]};draft.signals[k].channels=draft.signals[k].channels||{};draft.signals[k].channels.namePulse=draft.namePulse.signals[k];}
      await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,processed:nextOffset,total:keys.length,nextOffset,done:nextOffset>=keys.length,configured:draft.namePulse.configured,batch:batch.map(m=>{const x=draft.namePulse.signals[memberKey(m)]||{};return {id:m.id,name:m.name,monthlyTotalQcCnt:x.monthlyTotalQcCnt||0,score:x.score||0,state:x.observation?.state||'MISSING'};})});
    }
    if(action==='batch'){
      const members=active(),memberMap=new Map(members.map(m=>[memberKey(m),m])),keys=(draft.collectKeys||members.map(memberKey)),offset=Math.max(0,Number(b.offset)||0),size=Math.min(12,Math.max(1,Number(b.size)||8)),batch=keys.slice(offset,offset+size).map(k=>memberMap.get(k)).filter(Boolean);
      const results=await Promise.all(batch.map(async m=>{const k=memberKey(m);return [k,m.name,m.id,await collectMember(m,draft.eventKeywords||[],draft.globalSignals||{})];}));
      for(const [k,name,memberId,signal] of results){
        const existing=draft.signals[k]||{channels:{},evidenceItems:[]};
        signal.channels={...(existing.channels||{}),...(signal.channels||{})};
        signal.channels.namePulse=draft.namePulse?.signals?.[k]||existing.channels?.namePulse||mark({provider:'naver-search-ads-keywordstool',score:0,monthlyPcQcCnt:0,monthlyMobileQcCnt:0,monthlyTotalQcCnt:0},'naver-search-ads-keywordstool',STATES.MISSING,draft.namePulse?.configured?'Name Pulse batch not collected':'NAVER Search Ads not configured');
        signal.evidenceItems=[...(signal.evidenceItems||[]),...(existing.evidenceItems||[])].slice(0,40);draft.signals[k]=signal;
      }
      const nextOffset=offset+batch.length;draft.updatedAt=new Date().toISOString();if(nextOffset>=keys.length)draft.status='collected';
      await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,processed:nextOffset,total:keys.length,rosterTotal:members.length,nextOffset,done:nextOffset>=keys.length,batch:results.map(([k,name,memberId,s])=>({id:memberId,name,news6:s.channels?.news?.count6||0,daumSurface:s.channels?.daumSurface?.surfaceHits||0,warning:s.warning||null}))});
    }
    if(action==='prepare-enrichment'){
      const count=active().length;if(Object.keys(draft.signals||{}).length<count)return res.status(409).json({ok:false,error:`수집이 아직 끝나지 않았습니다. ${Object.keys(draft.signals||{}).length}/${count}`});
      const n=draft.mode==='full'?Math.max(20,Math.min(100,Number(process.env.KEYLESS_ENRICH_TOP_N||process.env.ENRICH_TOP_N)||80)):QUICK_ENRICH_TOP_N;
      const ranked=active().map(m=>({key:memberKey(m),id:m.id,name:m.name,heat:preliminaryHeat(draft.signals[memberKey(m)])})).sort((a,b)=>b.heat-a.heat);
      const eventKeys=ranked.filter(x=>{const c=draft.signals[x.key]?.channels||{};return Object.values(c).some(s=>(s?.event6||s?.eventHits||0)>0);}).map(x=>x.key);
      const trendKeys=active().filter(m=>(draft.globalSignals?.trends?.signals?.[memberKey(m)]?.score||0)>0).sort((a,b)=>(draft.globalSignals?.trends?.signals?.[memberKey(b)]?.score||0)-(draft.globalSignals?.trends?.signals?.[memberKey(a)]?.score||0)).map(m=>memberKey(m));
      const previous=await store.getJSON('jjdd:current').catch(()=>null),previousTop=(previous?.members||[]).filter(x=>x.id!==300).sort((a,b)=>(Number(a.overallRank)||Number(a.rank)||9999)-(Number(b.overallRank)||Number(b.rank)||9999)).slice(0,40).map(x=>`id:${Number(x.id)}`);
      const rotationSize=Math.min(draft.mode==='full'?35:14,n),rotationStart=(Math.floor(Date.now()/(6*3600000))*rotationSize)%active().length,rotation=[...active().slice(rotationStart),...active().slice(0,rotationStart)].slice(0,rotationSize).map(memberKey);
      draft.enrichmentNames=[...new Set([...eventKeys,...trendKeys.slice(0,35),...previousTop,...rotation,...ranked.slice(0,35).map(x=>x.key)])].filter(k=>draft.signals[k]).slice(0,n);
      const youtubeCap=Math.max(0,Math.min(25,Number(process.env.YOUTUBE_ENRICH_TOP_N)||20)),xCap=Math.max(0,Math.min(50,Number(process.env.X_ENRICH_TOP_N)||20)),bigKindsCap=Math.max(0,Math.min(40,Number(process.env.BIGKINDS_ENRICH_TOP_N)||30));
      const quotaPriority=[...new Set([...eventKeys,...trendKeys,...ranked.map(x=>x.key),...previousTop])].filter(k=>draft.signals[k]);
      draft.youtubeEnrichmentNames=quotaPriority.filter(name=>draft.enrichmentNames.includes(name)).slice(0,youtubeCap);draft.xEnrichmentNames=quotaPriority.filter(name=>draft.enrichmentNames.includes(name)).slice(0,xCap);draft.bigKindsEnrichmentNames=bigKindsCreds().configured?quotaPriority.filter(name=>draft.enrichmentNames.includes(name)).slice(0,bigKindsCap):[];
      draft.enrichmentDone=0;draft.status='enriching';await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,total:draft.enrichmentNames.length,names:draft.enrichmentNames,configured:{youtube:Boolean(process.env.YOUTUBE_API_KEY),x:Boolean(process.env.X_BEARER_TOKEN),bigKinds:Boolean(bigKindsCreds().configured),keyless:true},quota:{youtube:youtubeCap,x:xCap,bigKinds:bigKindsCap},sourceHealth:draft.sourceHealth});
    }
    if(action==='enrich'){
      const offset=Math.max(0,Number(b.offset)||0),size=Math.min(5,Math.max(1,Number(b.size)||4)),names=(draft.enrichmentNames||[]).slice(offset,offset+size);
      const map=new Map(active().map(m=>[memberKey(m),m]));
      const ytSet=new Set(draft.youtubeEnrichmentNames||[]),xSet=new Set(draft.xEnrichmentNames||[]),bkSet=new Set(draft.bigKindsEnrichmentNames||[]);
      const results=await Promise.all(names.map(async k=>[k,await collectEnrichmentMember(map.get(k),draft.eventKeywords||[],draft.globalSignals||{},{allowYoutube:ytSet.has(k),allowX:xSet.has(k),allowBigKinds:bkSet.has(k)})]));
      for(const [k,en] of results){draft.signals[k]=draft.signals[k]||{channels:{},evidenceItems:[]};Object.assign(draft.signals[k].channels,en.channels||{});const extra=Object.values(en.channels||{}).flatMap(x=>x?.headlines||[]);draft.signals[k].evidenceItems=[...(draft.signals[k].evidenceItems||[]),...extra].slice(0,40);draft.signals[k].health={...(draft.signals[k].health||{}),...(en.health||{})};if(en.warning)draft.signals[k].warning=[draft.signals[k].warning,en.warning].filter(Boolean).join('; ');}
      const nextOffset=offset+names.length;draft.enrichmentDone=nextOffset;if(nextOffset>=(draft.enrichmentNames||[]).length)draft.status='enriched';await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,nextOffset,total:(draft.enrichmentNames||[]).length,done:nextOffset>=(draft.enrichmentNames||[]).length});
    }
    if(action==='finalize'){
      const count=active().length;if(draft.namePulse?.configured&&Number(draft.namePulse?.processed||0)<Number(draft.namePulse?.total||0))return res.status(409).json({ok:false,error:`Name Pulse 수집이 아직 끝나지 않았습니다. ${draft.namePulse?.processed||0}/${draft.namePulse?.total||0}`});if(Object.keys(draft.signals||{}).length<count)return res.status(409).json({ok:false,error:`수집이 아직 끝나지 않았습니다. ${Object.keys(draft.signals||{}).length}/${count}`});
      const previous=await store.getJSON('jjdd:current'),traffic=await readTrafficSignals(active());
      draft.sourceHealth=aggregateSourceHealth(draft);
      draft.preview=computeSnapshot(roster,draft.signals,{eventTitle:draft.eventTitle,eventKeywords:draft.eventKeywords,sourceHealth:draft.sourceHealth,globalSignals:draft.globalSignals,globalNews:draft.globalNews},previous,traffic);draft.status='preview';draft.updatedAt=new Date().toISOString();await store.setJSON(key,draft,DRAFT_TTL);await store.setJSON(PERF_SIGNAL_CACHE_KEY,{savedAt:draft.updatedAt,mode:draft.mode||'quick',signals:draft.signals},PERF_SIGNAL_CACHE_TTL).catch(()=>{});
      const allMembers=draft.preview.members.filter(x=>Number(x.id)!==300&&String(x.party||'')!=='공석').map(adminMemberView),movers=allMembers.filter(x=>Number.isFinite(x.change6h)).sort((a,b)=>Math.abs(b.change6h)-Math.abs(a.change6h)).slice(0,20);
      return res.status(200).json({ok:true,draftId,preview:{version:draft.preview.version,modelVersion:draft.preview.modelVersion,comparisonCompatible:draft.preview.comparisonCompatible,timestamp:draft.preview.timestamp,members:allMembers,top30:allMembers.slice(0,30),movers,quality:draft.preview.quality,photoIntegrity:{localTotal:active().filter(x=>x.entityType==='metro'||x.entityType==='local').length,verified:active().filter(x=>(x.entityType==='metro'||x.entityType==='local')&&x.photoVerified===true&&x.officialPhoto).length,safeFallback:active().filter(x=>(x.entityType==='metro'||x.entityType==='local')&&!(x.photoVerified===true&&x.officialPhoto)).length},configuredSources:draft.preview.configuredSources,detectedIssues:draft.preview.detectedIssues,sourceHealth:draft.preview.sourceHealth,globalNews:draft.preview.globalNews}});
    }
    return res.status(400).json({ok:false,error:'Unknown action'});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
