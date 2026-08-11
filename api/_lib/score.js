function clamp(x,a=0,b=100){return Math.max(a,Math.min(b,x));}
function round1(v){return Math.round(v*10)/10;}
function grade(v){return v>=85?'S':v>=70?'A':v>=55?'B':v>=35?'C':'D';}
function logisticCount(n,k){return 100*(1-Math.exp(-Math.max(0,n)/k));}
function channelMomentum(s={},opts={}){
  const c6=Number(s.count6||0),c24=Number(s.count24||0),c7=Number(s.count7d||0),src=Number(s.sources6||0);
  const hist6=Math.max(0,c7-c24)/24,prev18=Math.max(0,c24-c6)/3;
  const baseline=Math.max(opts.floor??0.7,0.60*hist6+0.40*prev18);
  const rise=(c6+2)/(baseline+2);
  const surge=clamp(100*(1-Math.exp(-Math.max(0,Math.log2(Math.max(1e-6,rise)))/2.1)));
  const volume=logisticCount(c6,opts.volumeK||8);
  const breadth=logisticCount(src,opts.breadthK||3);
  const ageH=Number.isFinite(s.latest)?Math.max(0,(Date.now()-s.latest)/3600000):72;
  const freshness=clamp(100*Math.pow(2,-ageH/(opts.halfLife||4)));
  const accel=clamp(50+28*Math.log2(Math.max(.25,(c6+1)/(prev18+1))));
  const support=(1-Math.exp(-c6/(opts.supportK||5)))*(.55+.45*(1-Math.exp(-src/2)));
  const core=.42*surge+.25*volume+.20*breadth+.13*(.55*freshness+.45*accel);
  return {score:clamp(core*(.38+.62*support)),surge,volume,breadth,freshness,accel,support,rise,baseline};
}
function internalMomentum(s={}){
  const c=Number(s.count6||0),b=Math.max(.5,Number(s.baseline7d||s.baseline24||0));
  const rise=(c+2)/(b+2),surge=clamp(100*(1-Math.exp(-Math.max(0,Math.log2(rise))/2)));
  const volume=logisticCount(c,18),score=clamp(.62*surge+.38*volume);
  return {score:score*(1-Math.exp(-c/8)),surge,volume};
}
const STOP=new Set('국회의원 의원 국회 정치 정치권 더불어민주당 민주당 국민의힘 조국혁신당 진보당 개혁신당 무소속 대표 위원장 정부 대통령 대한민국 관련 오늘 최근 대해 위한 통해 하는 했다 한다 있는 없는 기자 뉴스 단독 종합 속보 인터뷰 포토 영상'.split(/\s+/));
function tokens(title=''){
  return String(title).toLowerCase().replace(/[^0-9a-z가-힣 ]+/g,' ').split(/\s+/).map(x=>x.trim()).filter(x=>x.length>=2&&!STOP.has(x)&&!/^(의원|대표|위원|기자)$/.test(x));
}
function buildIssueClusters(signals){
  const articles=new Map();
  for(const [name,sig] of Object.entries(signals||{})){
    for(const it of sig.evidenceItems||[]){
      const key=(it.link||it.title||'').split('?')[0];if(!key) continue;
      const a=articles.get(key)||{title:it.title||'',source:it.source||'',ts:it.ts||0,members:new Set(),channels:new Set()};
      a.members.add(name);a.channels.add(it.channel||'');articles.set(key,a);
    }
  }
  const grams=new Map();
  for(const a of articles.values()){
    const ts=tokens(a.title),terms=new Set(ts);
    for(let n=2;n<=3;n++) for(let i=0;i<=ts.length-n;i++) terms.add(ts.slice(i,i+n).join(' '));
    for(const term of terms){
      if(term.length<3) continue;
      const g=grams.get(term)||{term,articles:new Set(),sources:new Set(),members:new Map(),latest:0};
      g.articles.add(a.title);if(a.source)g.sources.add(a.source);g.latest=Math.max(g.latest,a.ts||0);
      for(const m of a.members) g.members.set(m,(g.members.get(m)||0)+1);
      grams.set(term,g);
    }
  }
  const clusters=[];
  for(const g of grams.values()){
    const ac=g.articles.size,sc=g.sources.size;if(ac<3||sc<2) continue;
    const ageH=g.latest?Math.max(0,(Date.now()-g.latest)/3600000):72;
    const strength=100*(1-Math.exp(-ac/10))*(.55+.45*(1-Math.exp(-sc/4)))*(.75+.25*Math.pow(2,-ageH/6));
    clusters.push({term:g.term,articles:ac,sources:sc,members:Object.fromEntries(g.members),strength:round1(strength),latest:g.latest});
  }
  clusters.sort((a,b)=>b.strength-a.strength||b.articles-a.articles);
  const picked=[];
  for(const c of clusters){
    if(picked.some(p=>p.term.includes(c.term)||c.term.includes(p.term))) continue;
    picked.push(c);if(picked.length>=8) break;
  }
  return picked;
}
function automaticCentrality(name,clusters=[]){
  const vals=[];
  for(const c of clusters){
    const mc=Number(c.members?.[name]||0);if(!mc) continue;
    const share=Math.sqrt(mc/Math.max(1,c.articles));
    vals.push(c.strength*share);
  }
  vals.sort((a,b)=>b-a);
  return clamp((vals[0]||0)+.35*(vals[1]||0)+.15*(vals[2]||0));
}
function manualEvent(signal={}){
  const ch=signal.channels||{},all=['news','web','blog','cafe','video','youtube'].map(k=>ch[k]||{});
  const e=all.reduce((a,x)=>a+Number(x.event6||0),0),n=all.reduce((a,x)=>a+Number(x.count6||0),0);
  if(!e) return 0;
  const share=e/Math.max(1,n),support=1-Math.exp(-e/4);
  return clamp(100*share*support);
}
function sourceFamilyCount(signal={},traffic={}){
  const ch=signal.channels||{};let n=0;
  if((ch.news?.count6||0)>0)n++;
  if(['web','blog','cafe'].some(k=>(ch[k]?.count6||0)>0))n++;
  if((ch.video?.count6||0)>0||(ch.youtube?.count6||0)>0)n++;
  if((ch.x?.count6||0)>0)n++;
  if((traffic.count6||0)>=3)n++;
  return n;
}
function computeMember(signal={},traffic={},autoEvent=0){
  const ch=signal.channels||{};
  const news=channelMomentum(ch.news||{}, {volumeK:9,halfLife:3.5});
  const web=channelMomentum(ch.web||{}, {volumeK:8,halfLife:5}),blog=channelMomentum(ch.blog||{}, {volumeK:7,halfLife:5}),cafe=channelMomentum(ch.cafe||{}, {volumeK:7,halfLife:5});
  const portal=clamp(.34*web.score+.36*blog.score+.30*cafe.score);
  const kvideo=channelMomentum(ch.video||{}, {volumeK:6,halfLife:5}),yt=channelMomentum(ch.youtube||{}, {volumeK:5,halfLife:4}),xx=channelMomentum(ch.x||{}, {volumeK:40,breadthK:1,halfLife:3});
  const internal=internalMomentum(traffic||{});
  const videoSocial=clamp(.35*kvideo.score+.35*yt.score+.20*xx.score+.10*internal.score);
  const mEvent=manualEvent(signal),event=clamp(Math.max(autoEvent,.65*mEvent+.35*autoEvent));
  const freshPool=[news,web,blog,cafe,kvideo,yt,xx].filter(x=>x&&Number.isFinite(x.freshness));
  const freshness=freshPool.length?clamp(freshPool.reduce((a,x)=>a+x.freshness,0)/freshPool.length):0;
  const accel=freshPool.length?clamp(freshPool.reduce((a,x)=>a+x.accel,0)/freshPool.length):0;
  const freshAccel=clamp(.55*freshness+.45*accel);
  let raw=.25*news.score+.20*portal+.20*videoSocial+.25*event+.10*freshAccel;
  const families=sourceFamilyCount(signal,traffic);
  const cap=[25,42,65,82,94,100][Math.min(5,families)]||25;
  raw=Math.min(raw,cap);
  const evidenceConfidence=clamp(12+17*families+8*(1-Math.exp(-(ch.news?.sources6||0)/3))+8*(1-Math.exp(-(traffic.count6||0)/8)));
  return {raw,news:news.score,portal,videoSocial,event,freshAccel,families,evidenceConfidence,details:{news,web,blog,cafe,kvideo,yt,xx,internal,mEvent,autoEvent}};
}
function makeMetric(label,v){v=round1(clamp(v));return [label,grade(v),v];}
function computeSnapshot(roster,signals,context={},previous=null,trafficSignals={}){
  const active=roster.filter(x=>x.id!==300&&x.party!=='공석');
  const clusters=buildIssueClusters(signals);
  let scored=active.map(m=>{
    const sig=signals[m.name]||{},traffic=trafficSignals[m.name]||{},auto=automaticCentrality(m.name,clusters),c=computeMember(sig,traffic,auto);
    const ch=sig.channels||{};
    const tiebreak=(ch.news?.count24||0)*1e-5+(ch.news?.sources24||0)*1e-6-m.id*1e-10;
    return {member:m,signal:sig,traffic,components:c,sortScore:c.raw+tiebreak};
  }).sort((a,b)=>b.sortScore-a.sortScore);
  let prior=Infinity;
  scored=scored.map((x,i)=>{
    let display=round1(x.components.raw);if(i>0&&display>=prior&&prior>.1)display=round1(Math.max(.1,prior-.1));prior=display;
    const prev=previous?.members?.find?.(p=>p.name===x.member.name),change6h=Number.isFinite(prev?.rank)?prev.rank-(i+1):null;
    const metrics=[makeMetric('뉴스 급상승',x.components.news),makeMetric('포털·커뮤니티',x.components.portal),makeMetric('영상·SNS',x.components.videoSocial),makeMetric('이슈 중심성',x.components.event),makeMetric('신선도·가속도',x.components.freshAccel)];
    const channels=x.signal.channels||{},sourceBadges=[];
    if((channels.news?.count6||0)>0)sourceBadges.push('뉴스');if(['web','blog','cafe'].some(k=>(channels[k]?.count6||0)>0))sourceBadges.push('포털');if((channels.video?.count6||0)>0)sourceBadges.push('동영상');if((channels.youtube?.count6||0)>0)sourceBadges.push('YouTube');if((channels.x?.count6||0)>0)sourceBadges.push('X');if((x.traffic.count6||0)>=3)sourceBadges.push('정정당당');
    return {id:x.member.id,name:x.member.name,party:x.member.party,region:x.member.region,constituency:x.member.constituency,rank:i+1,score:display,rawScore:round1(x.components.raw),grade:grade(display),change6h,metrics,
      sourceCount:x.components.families,evidenceConfidence:round1(x.components.evidenceConfidence),sourceBadges,eventLabel:context.eventTitle||'현재 주요 정치 이슈',latest:channels.news?.latest?new Date(channels.news.latest).toISOString():null,
      signal:{count6:channels.news?.count6||0,count24:channels.news?.count24||0,count7d:channels.news?.count7d||0,sources6:channels.news?.sources6||0,event6:channels.news?.event6||0,headlines:channels.news?.headlines||[],channels,traffic:x.traffic,autoEvent:round1(x.components.details.autoEvent),manualEvent:round1(x.components.details.mEvent)}};
  });
  scored.push({id:300,name:'강릉시 국회의원 공석',party:'공석',region:'강원',constituency:'강원 강릉시',rank:300,score:0,rawScore:0,grade:'D',change6h:0,metrics:[['뉴스 급상승','D',0],['포털·커뮤니티','D',0],['영상·SNS','D',0],['이슈 중심성','D',0],['신선도·가속도','D',0]],sourceCount:0,evidenceConfidence:0,sourceBadges:[],eventLabel:'공석',signal:{}});
  const configured={googleNews:true,naverNews:Boolean(process.env.NAVER_API_HUB_CLIENT_ID&&process.env.NAVER_API_HUB_CLIENT_SECRET),kakao:Boolean(process.env.KAKAO_REST_API_KEY),youtube:Boolean(process.env.YOUTUBE_API_KEY),x:Boolean(process.env.X_BEARER_TOKEN),internal:true};
  const top30=scored.slice(0,30),quality={configuredSources:configured,top30MultiSource:top30.filter(x=>x.sourceCount>=2).length,top30ThreePlus:top30.filter(x=>x.sourceCount>=3).length,top30SingleSource:top30.filter(x=>x.sourceCount<=1).length,warning:''};
  if(quality.top30SingleSource>10)quality.warning='상위권 다수가 단일 원천에 의존합니다. Kakao/YouTube 등 추가 원천을 연결한 뒤 게시를 권장합니다.';
  const sourceSummary=Object.entries(configured).filter(([,on])=>on).map(([k])=>k);
  return {version:'NOW Rank v1.4 Multi-Source Consensus',timestamp:new Date().toISOString(),cadenceHours:6,event:{title:context.eventTitle||'',keywords:context.eventKeywords||[]},configuredSources:configured,sourceSummary,detectedIssues:clusters.slice(0,5),quality,members:scored};
}
module.exports={computeSnapshot,computeMember,buildIssueClusters,channelMomentum,grade,clamp};
