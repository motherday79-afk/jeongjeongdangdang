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
const {memberKey}=require('../../lib/member_key');

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
        for(const m of batch)draft.namePulse.signals[memberKey(m)]=mark({provider:'naver-search-ads-keywordstool',score:0,monthlyPcQcCnt:0,monthlyMobileQcCnt:0,monthlyTotalQcCnt:0},'naver-search-ads-keywordstool',STATES.MISSING,'NAVER Search Ads credentials not configured');
      }else{
        const rows=await queryKeywords(batch.map(m=>m.name));
        rows.forEach((row,i)=>{
          const member=batch[i],name=member.name,k=memberKey(member);
          if(row?.ok){
            const total=row.found?Math.max(0,Number(row.monthlyTotalQcCnt)||0):0;
            // 이름만 제공되는 검색광고 키워드 도구는 동명이인을 구별할 수 없습니다.
            // 두 박지원 의원에게 동일 검색량을 중복 반영하지 않고, 보조 정보만 보존합니다.
            const ambiguous=Boolean(member.ambiguousName),score=ambiguous?0:searchScaleScore(total);
            const detail=ambiguous?'동명이인 이름 검색량 · 인물별 순위 반영 제외':(row.found?'':'API 정상 · 정확 의원명 키워드 미반환(검색량 0으로 처리)');
            draft.namePulse.signals[k]=mark({provider:'naver-search-ads-keywordstool',score,matchedKeyword:row.found?(row.matchedKeyword||name):null,monthlyPcQcCnt:ambiguous?0:(row.found?(Number(row.monthlyPcQcCnt)||0):0),monthlyMobileQcCnt:ambiguous?0:(row.found?(Number(row.monthlyMobileQcCnt)||0):0),monthlyTotalQcCnt:ambiguous?0:total,sharedNameMonthlyTotalQcCnt:ambiguous?total:null,ambiguousName:ambiguous,found:Boolean(row.found),fetchedAt:row.fetchedAt||new Date().toISOString()},'naver-search-ads-keywordstool',ambiguous?STATES.ZERO:(total>0?STATES.OBSERVED:STATES.ZERO),detail);
          }else{
            draft.namePulse.signals[k]=mark({provider:'naver-search-ads-keywordstool',score:0,monthlyPcQcCnt:0,monthlyMobileQcCnt:0,monthlyTotalQcCnt:0,found:false},'naver-search-ads-keywordstool',STATES.MISSING,row?.error||'Name Pulse request failed');
          }
        });
      }
      const nextOffset=offset+batch.length;draft.namePulse.processed=nextOffset;draft.updatedAt=new Date().toISOString();await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,processed:nextOffset,total:members.length,nextOffset,done:nextOffset>=members.length,configured:draft.namePulse.configured,batch:batch.map(m=>{const x=draft.namePulse.signals[memberKey(m)]||{};return {id:m.id,name:m.name,monthlyTotalQcCnt:x.monthlyTotalQcCnt||0,score:x.score||0,state:x.observation?.state||'MISSING'};})});
    }
    if(action==='batch'){
      const members=active(),offset=Math.max(0,Number(b.offset)||0),size=Math.min(8,Math.max(1,Number(b.size)||6)),batch=members.slice(offset,offset+size);
      const results=await Promise.all(batch.map(async m=>{const k=memberKey(m);return [k,m.name,m.id,await collectMember(m,draft.eventKeywords||[],draft.globalSignals||{})];}));
      for(const [k,name,memberId,signal] of results){
        signal.channels=signal.channels||{};
        signal.channels.namePulse=draft.namePulse?.signals?.[k]||mark({provider:'naver-search-ads-keywordstool',score:0,monthlyPcQcCnt:0,monthlyMobileQcCnt:0,monthlyTotalQcCnt:0},'naver-search-ads-keywordstool',STATES.MISSING,draft.namePulse?.configured?'Name Pulse batch not collected':'NAVER Search Ads not configured');
        draft.signals[k]=signal;
      }
      const nextOffset=offset+batch.length;draft.updatedAt=new Date().toISOString();if(nextOffset>=members.length)draft.status='collected';
      await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,processed:Object.keys(draft.signals).length,total:members.length,nextOffset,done:nextOffset>=members.length,batch:results.map(([k,name,memberId,s])=>({id:memberId,name,news6:s.channels?.news?.count6||0,daumSurface:s.channels?.daumSurface?.surfaceHits||0,warning:s.warning||null}))});
    }
    if(action==='prepare-enrichment'){
      const count=active().length;if(Object.keys(draft.signals||{}).length<count)return res.status(409).json({ok:false,error:`수집이 아직 끝나지 않았습니다. ${Object.keys(draft.signals||{}).length}/${count}`});
      const n=Math.max(20,Math.min(100,Number(process.env.KEYLESS_ENRICH_TOP_N||process.env.ENRICH_TOP_N)||80));
      const ranked=active().map(m=>({key:memberKey(m),id:m.id,name:m.name,heat:preliminaryHeat(draft.signals[memberKey(m)])})).sort((a,b)=>b.heat-a.heat);
      const eventKeys=ranked.filter(x=>{const c=draft.signals[x.key]?.channels||{};return Object.values(c).some(s=>(s?.event6||s?.eventHits||0)>0);}).map(x=>x.key);
      const trendKeys=active().filter(m=>(draft.globalSignals?.trends?.signals?.[memberKey(m)]?.score||0)>0).sort((a,b)=>(draft.globalSignals?.trends?.signals?.[memberKey(b)]?.score||0)-(draft.globalSignals?.trends?.signals?.[memberKey(a)]?.score||0)).map(m=>memberKey(m));
      const previous=await store.getJSON('jjdd:current').catch(()=>null),previousTop=(previous?.members||[]).filter(x=>x.id!==300).sort((a,b)=>a.rank-b.rank).slice(0,40).map(x=>`id:${Number(x.id)}`);
      const rotationSize=Math.min(35,n),rotationStart=(Math.floor(Date.now()/(6*3600000))*rotationSize)%active().length,rotation=[...active().slice(rotationStart),...active().slice(0,rotationStart)].slice(0,rotationSize).map(memberKey);
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
