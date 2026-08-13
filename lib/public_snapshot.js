function compactHeadline(h){
  if(!h) return null;
  if(typeof h==='string') return {title:h};
  return {title:String(h.title||''),source:String(h.source||''),ts:h.ts??null};
}
function compactMember(x={}){
  const sig=x.signal||{};
  return {
    id:x.id,name:x.name,party:x.party,region:x.region,constituency:x.constituency,
    rank:x.rank,score:x.score,rawScore:x.rawScore,grade:x.grade,
    previousRank:Number.isFinite(x.previousRank)?x.previousRank:null,
    changeRefresh:Number.isFinite(x.changeRefresh)?x.changeRefresh:(Number.isFinite(x.change6h)?x.change6h:null),
    change6h:Number.isFinite(x.change6h)?x.change6h:null,
    searchRank:Number.isFinite(x.searchRank)?x.searchRank:null,
    searchScore:Number.isFinite(x.searchScore)?x.searchScore:null,
    searchRaw:Number.isFinite(x.searchRaw)?x.searchRaw:null,
    mediaRank:Number.isFinite(x.mediaRank)?x.mediaRank:null,
    mediaScore:Number.isFinite(x.mediaScore)?x.mediaScore:null,
    mediaRaw:Number.isFinite(x.mediaRaw)?x.mediaRaw:null,
    metrics:Array.isArray(x.metrics)?x.metrics:[],
    eventLabel:x.eventLabel||'',sourceCount:Number(x.sourceCount||0),latest:x.latest||null,
    evidenceConfidence:Number.isFinite(Number(x.evidenceConfidence))?Number(x.evidenceConfidence):null,
    collectionStatus:x.collection?.status||null,
    whyNow:x.whyNow||null,
    whyNowKeywords:Array.isArray(x.whyNowKeywords)?x.whyNowKeywords.slice(0,4):[],
    articleTitles:Array.isArray(x.articleTitles)?x.articleTitles.slice(0,8):[],
    newsTitles:Array.isArray(x.newsTitles)?x.newsTitles.slice(0,8):[],
    signal:{
      count6:Number(sig.count6||0),count24:Number(sig.count24||0),count7d:Number(sig.count7d||0),
      sources6:Number(sig.sources6||0),event6:Number(sig.event6||0),
      headlines:(Array.isArray(sig.headlines)?sig.headlines:[]).slice(0,6).map(compactHeadline).filter(Boolean),
      bigKindsHeadlines:(Array.isArray(sig.bigKindsHeadlines)?sig.bigKindsHeadlines:[]).slice(0,5).map(compactHeadline).filter(Boolean),
      bigKindsRelatedWords:(Array.isArray(sig.bigKindsRelatedWords)?sig.bigKindsRelatedWords:[]).slice(0,10)
    }
  };
}
function publicSnapshot(snap={}){
  return {
    schemaVersion:2,
    publicationId:snap.publicationId||null,publishedAt:snap.publishedAt||null,
    timestamp:snap.timestamp||null,version:snap.version||null,modelVersion:snap.modelVersion||null,
    cadenceHours:snap.cadenceHours||null,sourceSummary:Array.isArray(snap.sourceSummary)?snap.sourceSummary:[],
    detectedIssues:Array.isArray(snap.detectedIssues)?snap.detectedIssues.slice(0,10):[],
    members:(Array.isArray(snap.members)?snap.members:[]).map(compactMember)
  };
}
module.exports={compactMember,publicSnapshot};
