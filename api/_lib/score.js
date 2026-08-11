function clamp(x,a=0,b=100){return Math.max(a,Math.min(b,x));}
function grade(v){return v>=85?'S':v>=70?'A':v>=55?'B':v>=35?'C':'D';}
function round1(v){return Math.round(v*10)/10;}
function scoreSignal(s){
  const c6=s.count6||0,c24=s.count24||0,c7=s.count7d||0;
  const baseline6=Math.max(.6,Math.max(0,c7-c24)/24);
  const baseline24=Math.max(1,Math.max(0,c7-c24)/6);
  const rise6=c6/baseline6;
  const rise24=c24/baseline24;
  const confidence=1-Math.exp(-c6/4);
  const surge=clamp(100*(1-Math.exp(-Math.max(0,rise6-.65)/2.8))*(.55+.45*confidence));
  const volume=clamp(100*(1-Math.exp(-c6/7)));
  const breadth=clamp(100*(1-Math.exp(-(s.sources6||0)/5)));
  const event=clamp(c6?100*(s.event6||0)/c6:0);
  const ageH=Number.isFinite(s.latest)?Math.max(0,(Date.now()-s.latest)/3600000):48;
  const freshness=clamp(100*Math.pow(2,-ageH/3));
  const accel=clamp(50+28*Math.log2(Math.max(.25,rise6/Math.max(.75,rise24))));
  const quality=clamp(.6*breadth+.4*volume);
  const raw=.35*surge+.20*quality+.20*event+.15*accel+.10*freshness;
  return {raw,surge,volume,breadth,event,accel,freshness,rise6,rise24,quality};
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
    // Previous embedded public signal is a tiny deterministic tie-break only, not a direct score axis.
    const tiebreak=((m.baseline?.search||0)*.0001)+((m.baseline?.digital||0)*.00001)-(m.id*.0000001);
    return {member:m,signal:sig,components:c,sortScore:c.raw+tiebreak};
  }).sort((a,b)=>b.sortScore-a.sortScore);
  // Normalize raw operational evidence to a 0..100 NOW index without changing order.
  const vals=scored.map(x=>x.components.raw);
  const max=Math.max(...vals,1), min=Math.min(...vals,0);
  let priorRounded=Infinity;
  scored=scored.map((x,i)=>{
    let display=round1(10+90*(x.components.raw-min)/Math.max(1e-9,max-min));
    if(display>=priorRounded) display=round1(Math.max(.1,priorRounded-.1));
    priorRounded=display;
    const prevMember=previous?.members?.find?.(p=>p.name===x.member.name);
    const change6h=Number.isFinite(prevMember?.rank)?prevMember.rank-(i+1):null;
    const metrics=[
      makeMetric('상대 급상승',x.components.surge),
      makeMetric('최근 뉴스량',x.components.volume),
      makeMetric('이벤트 중심성',x.components.event),
      makeMetric('출처 다양성',x.components.breadth),
      makeMetric('신선도·가속도',(.55*x.components.freshness+.45*x.components.accel))
    ];
    return {
      id:x.member.id,name:x.member.name,party:x.member.party,region:x.member.region,constituency:x.member.constituency,
      rank:i+1,score:display,rawScore:round1(x.components.raw),grade:grade(display),change6h,
      metrics,sourceCount:x.signal.sources6||0,latest:x.signal.latest?new Date(x.signal.latest).toISOString():null,
      eventLabel: context.eventTitle || '현재 주요 정치 이슈',
      signal:{
        count6:x.signal.count6||0,count24:x.signal.count24||0,count7d:x.signal.count7d||0,
        sources6:x.signal.sources6||0,event6:x.signal.event6||0,source:x.signal.source||'unknown',
        rise6:round1(x.components.rise6),rise24:round1(x.components.rise24),
        headlines:x.signal.headlines||[]
      }
    };
  });
  scored.push({
    id:300,name:'강릉시 국회의원 공석',party:'공석',region:'강원',constituency:'강원 강릉시',
    rank:300,score:0,rawScore:0,grade:'D',change6h:0,
    metrics:[['상대 급상승','D',0],['최근 뉴스량','D',0],['이벤트 중심성','D',0],['출처 다양성','D',0],['신선도·가속도','D',0]],
    sourceCount:0,latest:null,eventLabel:'공석',signal:{}
  });
  const sourceSummary=[...new Set(scored.slice(0,299).map(x=>x.signal.source).filter(Boolean))];
  return {
    version:'NOW Rank v1.3 Operational',
    timestamp:new Date().toISOString(),
    cadenceHours:6,
    event:{title:context.eventTitle||'',keywords:context.eventKeywords||[]},
    sourceSummary,
    members:scored
  };
}
module.exports={computeSnapshot,scoreSignal,grade,clamp};
