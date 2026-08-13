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
const roster=require('../../data/roster.json');

const DRAFT_TTL=12*60*60;
function id(){return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;}
function body(req){return req.body||{};}
function active(){return roster.filter(x=>x.id!==300&&x.party!=='공석');}

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
  return out;
}
function adminMemberView(x){
  const ch=x?.signal?.channels||{};const sensors=Object.keys(ADMIN_SENSOR_LABELS).map(k=>compactSensor(k,ch[k]||{}));
  return {id:x.id,name:x.name,party:x.party,region:x.region,constituency:x.constituency,rank:x.rank,score:x.score,rawScore:x.rawScore,grade:x.grade,previousRank:x.previousRank,changeRefresh:x.changeRefresh,change6h:x.change6h,searchRank:x.searchRank,searchScore:x.searchScore,searchRaw:x.searchRaw,mediaRank:x.mediaRank,mediaScore:x.mediaScore,mediaRaw:x.mediaRaw,sourceCount:x.sourceCount,evidenceConfidence:x.evidenceConfidence,collection:x.collection||{},sourceBadges:x.sourceBadges||[],metrics:x.metrics||[],audit:x.audit||{},signal:{count6:x.signal?.count6||0,count24:x.signal?.count24||0,count7d:x.signal?.count7d||0,sources6:x.signal?.sources6||0,event6:x.signal?.event6||0,autoEvent:x.signal?.autoEvent||0,globalEvent:x.signal?.globalEvent||0,manualEvent:x.signal?.manualEvent||0,bigKindsRelatedWords:(x.signal?.bigKindsRelatedWords||[]).slice(0,10),headlines:(x.signal?.headlines||[]).slice(0,5).map(h=>({title:h.title||'',source:h.source||'',ts:h.ts||null})),bigKindsHeadlines:(x.signal?.bigKindsHeadlines||[]).slice(0,5).map(h=>({title:h.title||'',source:h.source||'',ts:h.ts||null}))},sensors};
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
      const draftId=id(),eventTitle=String(b.eventTitle||process.env.DEFAULT_EVENT_TITLE||'현재 주요 정치 이슈').trim();
      const eventKeywords=(Array.isArray(b.eventKeywords)?b.eventKeywords:String(b.eventKeywords||'').split(',')).map(x=>String(x).trim()).filter(Boolean).slice(0,12);
      const [globalSignals,globalNews]=await Promise.all([collectGlobalKeyless(active()),collectGlobalPolitics(active(),eventTitle,eventKeywords)]);
      const draft={id:draftId,status:'collecting',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),eventTitle,eventKeywords,signals:{},enrichmentNames:[],enrichmentDone:0,globalSignals,globalNews,sourceHealth:globalSignals.health||{},namePulse:{configured:Boolean(searchAdCreds().configured),signals:{},processed:0,total:active().length}};
      await store.setJSON(`jjdd:draft:${draftId}`,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,total:active().length,nextOffset:0,eventTitle,eventKeywords,sourceHealth:draft.sourceHealth,trendingMatches:Object.values(globalSignals.trends?.signals||{}).filter(x=>(x.score||0)>0).length,namePulse:{configured:draft.namePulse.configured,total:draft.namePulse.total},bigKinds:{configured:Boolean(bigKindsCreds().configured)},globalNews:{eventArticles:globalNews.eventArticleCount,eventSources:globalNews.eventSourceCount,broadArticles:globalNews.broadArticleCount,broadSources:globalNews.broadSourceCount,warnings:globalNews.warnings}});
    }
    const draftId=String(b.draftId||''),key=`jjdd:draft:${draftId}`,draft=await store.getJSON(key);
    if(!draft)return res.status(404).json({ok:false,error:'Refresh draft를 찾을 수 없습니다. 다시 시작해주세요.'});

    if(action==='name-pulse-batch'){
      const members=active(),offset=Math.max(0,Number(b.offset)||0),size=Math.min(12,Math.max(1,Number(b.size)||10)),batch=members.slice(offset,offset+size);
      if(!draft.namePulse)draft.namePulse={configured:Boolean(searchAdCreds().configured),signals:{},processed:0,total:members.length};
      if(!draft.namePulse.configured){
        for(const m of batch)draft.namePulse.signals[m.name]=mark({provider:'naver-search-ads-keywordstool',score:0,monthlyPcQcCnt:0,monthlyMobileQcCnt:0,monthlyTotalQcCnt:0},'naver-search-ads-keywordstool',STATES.MISSING,'NAVER Search Ads credentials not configured');
      }else{
        const rows=await queryKeywords(batch.map(m=>m.name));
        rows.forEach((row,i)=>{
          const name=batch[i].name;
          if(row?.ok){
            const total=row.found?Math.max(0,Number(row.monthlyTotalQcCnt)||0):0,score=searchScaleScore(total);
            const detail=row.found?'':'API 정상 · 정확 의원명 키워드 미반환(검색량 0으로 처리)';
            draft.namePulse.signals[name]=mark({provider:'naver-search-ads-keywordstool',score,matchedKeyword:row.found?(row.matchedKeyword||name):null,monthlyPcQcCnt:row.found?(Number(row.monthlyPcQcCnt)||0):0,monthlyMobileQcCnt:row.found?(Number(row.monthlyMobileQcCnt)||0):0,monthlyTotalQcCnt:total,rawMonthlyPcQcCnt:row.rawMonthlyPcQcCnt,rawMonthlyMobileQcCnt:row.rawMonthlyMobileQcCnt,found:Boolean(row.found),fetchedAt:row.fetchedAt||new Date().toISOString()},'naver-search-ads-keywordstool',total>0?STATES.OBSERVED:STATES.ZERO,detail);
          }else{
            draft.namePulse.signals[name]=mark({provider:'naver-search-ads-keywordstool',score:0,monthlyPcQcCnt:0,monthlyMobileQcCnt:0,monthlyTotalQcCnt:0,found:false},'naver-search-ads-keywordstool',STATES.MISSING,row?.error||'Name Pulse request failed');
          }
        });
      }
      const nextOffset=offset+batch.length;draft.namePulse.processed=nextOffset;draft.updatedAt=new Date().toISOString();await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,processed:nextOffset,total:members.length,nextOffset,done:nextOffset>=members.length,configured:draft.namePulse.configured,batch:batch.map(m=>{const x=draft.namePulse.signals[m.name]||{};return {name:m.name,monthlyTotalQcCnt:x.monthlyTotalQcCnt||0,score:x.score||0,state:x.observation?.state||'MISSING'};})});
    }
    if(action==='batch'){
      const members=active(),offset=Math.max(0,Number(b.offset)||0),size=Math.min(8,Math.max(1,Number(b.size)||6)),batch=members.slice(offset,offset+size);
      const results=await Promise.all(batch.map(async m=>[m.name,await collectMember(m,draft.eventKeywords||[],draft.globalSignals||{})]));
      for(const [name,signal] of results){
        signal.channels=signal.channels||{};
        signal.channels.namePulse=draft.namePulse?.signals?.[name]||mark({provider:'naver-search-ads-keywordstool',score:0,monthlyPcQcCnt:0,monthlyMobileQcCnt:0,monthlyTotalQcCnt:0},'naver-search-ads-keywordstool',STATES.MISSING,draft.namePulse?.configured?'Name Pulse batch not collected':'NAVER Search Ads not configured');
        draft.signals[name]=signal;
      }
      const nextOffset=offset+batch.length;draft.updatedAt=new Date().toISOString();if(nextOffset>=members.length)draft.status='collected';
      await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,processed:Object.keys(draft.signals).length,total:members.length,nextOffset,done:nextOffset>=members.length,batch:results.map(([name,s])=>({name,news6:s.channels?.news?.count6||0,daumSurface:s.channels?.daumSurface?.surfaceHits||0,warning:s.warning||null}))});
    }
    if(action==='prepare-enrichment'){
      const count=active().length;if(Object.keys(draft.signals||{}).length<count)return res.status(409).json({ok:false,error:`수집이 아직 끝나지 않았습니다. ${Object.keys(draft.signals||{}).length}/${count}`});
      const n=Math.max(20,Math.min(100,Number(process.env.KEYLESS_ENRICH_TOP_N||process.env.ENRICH_TOP_N)||80));
      const ranked=active().map(m=>({name:m.name,heat:preliminaryHeat(draft.signals[m.name])})).sort((a,b)=>b.heat-a.heat);
      const eventNames=ranked.filter(x=>{const c=draft.signals[x.name]?.channels||{};return Object.values(c).some(s=>(s?.event6||s?.eventHits||0)>0);}).map(x=>x.name);
      const trendNames=active().filter(m=>(draft.globalSignals?.trends?.signals?.[m.name]?.score||0)>0).sort((a,b)=>(draft.globalSignals?.trends?.signals?.[b.name]?.score||0)-(draft.globalSignals?.trends?.signals?.[a.name]?.score||0)).map(m=>m.name);
      const previous=await store.getJSON('jjdd:current').catch(()=>null),previousTop=(previous?.members||[]).filter(x=>x.id!==300).sort((a,b)=>a.rank-b.rank).slice(0,40).map(x=>x.name);
      const rotationSize=Math.min(35,n),rotationStart=(Math.floor(Date.now()/(6*3600000))*rotationSize)%active().length,rotation=[...active().slice(rotationStart),...active().slice(0,rotationStart)].slice(0,rotationSize).map(x=>x.name);
      draft.enrichmentNames=[...new Set([...eventNames,...trendNames.slice(0,35),...previousTop,...rotation,...ranked.slice(0,35).map(x=>x.name)])].slice(0,n);
      const youtubeCap=Math.max(0,Math.min(25,Number(process.env.YOUTUBE_ENRICH_TOP_N)||20)),xCap=Math.max(0,Math.min(50,Number(process.env.X_ENRICH_TOP_N)||20)),bigKindsCap=Math.max(0,Math.min(40,Number(process.env.BIGKINDS_ENRICH_TOP_N)||30));
      const quotaPriority=[...new Set([...eventNames,...trendNames,...ranked.map(x=>x.name),...previousTop])];
      draft.youtubeEnrichmentNames=quotaPriority.filter(name=>draft.enrichmentNames.includes(name)).slice(0,youtubeCap);draft.xEnrichmentNames=quotaPriority.filter(name=>draft.enrichmentNames.includes(name)).slice(0,xCap);draft.bigKindsEnrichmentNames=bigKindsCreds().configured?quotaPriority.filter(name=>draft.enrichmentNames.includes(name)).slice(0,bigKindsCap):[];
      draft.enrichmentDone=0;draft.status='enriching';await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,total:draft.enrichmentNames.length,names:draft.enrichmentNames,configured:{youtube:Boolean(process.env.YOUTUBE_API_KEY),x:Boolean(process.env.X_BEARER_TOKEN),bigKinds:Boolean(bigKindsCreds().configured),keyless:true},quota:{youtube:youtubeCap,x:xCap,bigKinds:bigKindsCap},sourceHealth:draft.sourceHealth});
    }
    if(action==='enrich'){
      const offset=Math.max(0,Number(b.offset)||0),size=Math.min(5,Math.max(1,Number(b.size)||4)),names=(draft.enrichmentNames||[]).slice(offset,offset+size);
      const map=new Map(active().map(m=>[m.name,m]));
      const ytSet=new Set(draft.youtubeEnrichmentNames||[]),xSet=new Set(draft.xEnrichmentNames||[]),bkSet=new Set(draft.bigKindsEnrichmentNames||[]);
      const results=await Promise.all(names.map(async name=>[name,await collectEnrichmentMember(map.get(name),draft.eventKeywords||[],draft.globalSignals||{},{allowYoutube:ytSet.has(name),allowX:xSet.has(name),allowBigKinds:bkSet.has(name)})]));
      for(const [name,en] of results){draft.signals[name]=draft.signals[name]||{channels:{},evidenceItems:[]};Object.assign(draft.signals[name].channels,en.channels||{});const extra=Object.values(en.channels||{}).flatMap(x=>x?.headlines||[]);draft.signals[name].evidenceItems=[...(draft.signals[name].evidenceItems||[]),...extra].slice(0,40);draft.signals[name].health={...(draft.signals[name].health||{}),...(en.health||{})};if(en.warning)draft.signals[name].warning=[draft.signals[name].warning,en.warning].filter(Boolean).join('; ');}
      const nextOffset=offset+names.length;draft.enrichmentDone=nextOffset;if(nextOffset>=(draft.enrichmentNames||[]).length)draft.status='enriched';await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,nextOffset,total:(draft.enrichmentNames||[]).length,done:nextOffset>=(draft.enrichmentNames||[]).length});
    }
    if(action==='finalize'){
      const count=active().length;if(draft.namePulse?.configured&&Number(draft.namePulse?.processed||0)<count)return res.status(409).json({ok:false,error:`Name Pulse 수집이 아직 끝나지 않았습니다. ${draft.namePulse?.processed||0}/${count}`});if(Object.keys(draft.signals||{}).length<count)return res.status(409).json({ok:false,error:`수집이 아직 끝나지 않았습니다. ${Object.keys(draft.signals||{}).length}/${count}`});
      const previous=await store.getJSON('jjdd:current'),traffic=await readTrafficSignals(active());
      draft.sourceHealth=aggregateSourceHealth(draft);
      draft.preview=computeSnapshot(roster,draft.signals,{eventTitle:draft.eventTitle,eventKeywords:draft.eventKeywords,sourceHealth:draft.sourceHealth,globalSignals:draft.globalSignals,globalNews:draft.globalNews},previous,traffic);draft.status='preview';draft.updatedAt=new Date().toISOString();await store.setJSON(key,draft,DRAFT_TTL);
      const allMembers=draft.preview.members.slice(0,299).map(adminMemberView),movers=allMembers.filter(x=>Number.isFinite(x.change6h)).sort((a,b)=>Math.abs(b.change6h)-Math.abs(a.change6h)).slice(0,20);
      return res.status(200).json({ok:true,draftId,preview:{version:draft.preview.version,modelVersion:draft.preview.modelVersion,comparisonCompatible:draft.preview.comparisonCompatible,timestamp:draft.preview.timestamp,members:allMembers,top30:allMembers.slice(0,30),movers,quality:draft.preview.quality,configuredSources:draft.preview.configuredSources,detectedIssues:draft.preview.detectedIssues,sourceHealth:draft.preview.sourceHealth,globalNews:draft.preview.globalNews}});
    }
    return res.status(400).json({ok:false,error:'Unknown action'});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
