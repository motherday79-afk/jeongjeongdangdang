function clamp(x,a=0,b=100){return Math.max(a,Math.min(b,x));}
function grade(v){return v>=85?'S':v>=70?'A':v>=55?'B':v>=35?'C':'D';}
function round1(v){return Math.round(v*10)/10;}
function scoreSignal(s){
  const c6=s.count6||0,c24=s.count24||0,c7=s.count7d||0;
  const src6=s.sources6||0;

  // Expected 6h volume from the previous 6 days + the prior 18h today.
  // A 1.0 floor prevents 1~2 sparse fallback articles from looking like a huge surge.
  const hist6=Math.max(0,c7-c24)/24;
  const prev18=Math.max(0,c24-c6)/3;
  const baseline6=Math.max(1,0.60*hist6+0.40*prev18);

  // Bayesian-style smoothing: tiny numerators cannot explode into 5x~10x ratios.
  const rise6=(c6+2)/(baseline6+2);
  const surge=clamp(100*(1-Math.exp(-Math.max(0,Math.log2(Math.max(1e-6,rise6)))/2.2)));

  const volume=clamp(100*(1-Math.exp(-c6/8)));
  const breadth=clamp(100*(1-Math.exp(-src6/3)));

  // Event centrality needs both share and enough event articles to be credible.
  const eventShare=c6?(s.event6||0)/c6:0;
  const eventSupport=1-Math.exp(-(s.event6||0)/3);
  const event=clamp(100*eventShare*eventSupport);

  const ageH=Number.isFinite(s.latest)?Math.max(0,(Date.now()-s.latest)/3600000):48;
  const freshness=clamp(100*Math.pow(2,-ageH/3));
  const accelRate=(c6+1)/(prev18+1);
  const accel=clamp(50+30*Math.log2(Math.max(.25,accelRate)));
  const freshAccel=clamp(.55*freshness+.45*accel);

  // Evidence support is deliberately conservative on Google RSS fallback.
  const evidence=(1-Math.exp(-c6/5))*(.55+.45*(1-Math.exp(-src6/2)));
  const core=.30*surge+.25*volume+.20*breadth+.15*event+.10*freshAccel;
  let raw=core*(.35+.65*evidence);

  // Hard evidence caps: 1~2 headlines can never become an authoritative 90~100 score.
  if(c6===0) raw=Math.min(raw,8);
  else if(c6===1) raw=Math.min(raw,25);
  else if(c6===2) raw=Math.min(raw,38);
  if(src6<=1) raw=Math.min(raw,42);

  return {raw:clamp(raw),surge,volume,breadth,event,accel,freshness,freshAccel,rise6,baseline6,evidence};
}
function makeMetric(label,value){
  const v=round1(clamp(value));
  return [label,grade(v),v];
}
function computeSnapshot(roster,signals,context={},previous=null){
  const active=roster.filter(x=>x.id!==300 && x.party!=='공석');
  let scored=active.map(m=>{
    const sig=signals[m.name]||{};
    const c=scoreSignal(sig);
    // Deterministic evidence-based tie-break only; never used as a visible bonus.
    const tiebreak=((sig.count24||0)*.0001)+((sig.sources24||0)*.00001)+((m.baseline?.search||0)*.000001)-(m.id*.000000001);
    return {member:m,signal:sig,components:c,sortScore:c.raw+tiebreak};
  }).sort((a,b)=>b.sortScore-a.sortScore);

  // IMPORTANT: no cross-sectional min-max normalization.
  // Visible NOW score remains the absolute evidence score, so a weak snapshot cannot manufacture a 100.
  let priorRounded=Infinity;
  scored=scored.map((x,i)=>{
    let display=round1(x.components.raw);
    if(i>0 && display>=priorRounded && priorRounded>0.1) display=round1(Math.max(.1,priorRounded-.1));
    priorRounded=display;
    const prevMember=previous?.members?.find?.(p=>p.name===x.member.name);
    const change6h=Number.isFinite(prevMember?.rank)?prevMember.rank-(i+1):null;
    const metrics=[
      makeMetric('상대 급상승',x.components.surge),
      makeMetric('최근 뉴스량',x.components.volume),
      makeMetric('이벤트 중심성',x.components.event),
      makeMetric('출처 다양성',x.components.breadth),
      makeMetric('신선도·가속도',x.components.freshAccel)
    ];
    return {
      id:x.member.id,name:x.member.name,party:x.member.party,region:x.member.region,constituency:x.member.constituency,
      rank:i+1,score:display,rawScore:round1(x.components.raw),grade:grade(display),change6h,
      metrics,sourceCount:x.signal.sources6||0,latest:x.signal.latest?new Date(x.signal.latest).toISOString():null,
      evidenceConfidence:round1(100*x.components.evidence),
      eventLabel: context.eventTitle || '현재 주요 정치 이슈',
      signal:{
        count6:x.signal.count6||0,count24:x.signal.count24||0,count7d:x.signal.count7d||0,
        sources6:x.signal.sources6||0,event6:x.signal.event6||0,source:x.signal.source||'unknown',
        rise6:round1(x.components.rise6),baseline6:round1(x.components.baseline6),
        headlines:x.signal.headlines||[]
      }
    };
  });
  scored.push({
    id:300,name:'강릉시 국회의원 공석',party:'공석',region:'강원',constituency:'강원 강릉시',
    rank:300,score:0,rawScore:0,grade:'D',change6h:0,
    metrics:[['상대 급상승','D',0],['최근 뉴스량','D',0],['이벤트 중심성','D',0],['출처 다양성','D',0],['신선도·가속도','D',0]],
    sourceCount:0,latest:null,evidenceConfidence:0,eventLabel:'공석',signal:{}
  });
  const sourceSummary=[...new Set(scored.slice(0,299).map(x=>x.signal.source).filter(Boolean))];
  const top30=scored.slice(0,30);
  const quality={
    membersWith6hNews:scored.slice(0,299).filter(x=>(x.signal.count6||0)>0).length,
    top30StrongEvidence:top30.filter(x=>(x.signal.count6||0)>=3 && (x.signal.sources6||0)>=2).length,
    top30SparseEvidence:top30.filter(x=>(x.signal.count6||0)<3 || (x.signal.sources6||0)<2).length,
    top1Count6:top30[0]?.signal?.count6||0,
    top1Sources6:top30[0]?.signal?.sources6||0
  };
  quality.warning=quality.top30SparseEvidence>10
    ?'Google News RSS 기준 상위권의 근거량이 아직 희박합니다. 게시 전 헤드라인과 출처를 반드시 검토하세요.'
    :'';
  return {
    version:'NOW Rank v1.3.2 Sparse-Signal Hotfix',
    timestamp:new Date().toISOString(),
    cadenceHours:6,
    event:{title:context.eventTitle||'',keywords:context.eventKeywords||[]},
    sourceSummary,quality,
    members:scored
  };
}
module.exports={computeSnapshot,scoreSignal,grade,clamp};
