const {cmd,getJSON,setJSON,parseJSONValue}=require('./store');
const {USER_SET_KEY}=require('./user_auth');

const BADGE_SCHEMA=1;
const CONFIG_KEY='jjdd:badge:config:v1';
const SEASON_KEY='jjdd:itsme:season:v1';
const TIER_ORDER={STANDARD:1,SILVER:2,GOLD:3,PLATINUM:4};
const TIER_LABEL={STANDARD:'STANDARD',SILVER:'SILVER',GOLD:'GOLD',PLATINUM:'PLATINUM'};

const FIXED_BADGES=[
  {id:'citizen_arrival',category:'생활',name:'입주신고',icon:'🏠',tier:'STANDARD',desc:'정참시에 첫 발을 남긴 시민',hint:'로그인 상태로 정참시를 방문하세요.',secret:false,condition:a=>num(a,'visits')>=1,progress:a=>prog(num(a,'visits'),1)},
  {id:'first_post',category:'정뮤니티',name:'첫발언',icon:'✍️',tier:'STANDARD',desc:'정뮤니티에 첫 글을 남긴 시민',hint:'정뮤니티 게시글을 1개 작성하세요.',secret:false,condition:a=>num(a,'communityPosts')>=1,progress:a=>prog(num(a,'communityPosts'),1)},
  {id:'first_comment',category:'토론',name:'첫마디',icon:'💬',tier:'STANDARD',desc:'첫 댓글로 토론에 참여한 시민',hint:'정뮤니티 또는 IT’S ME에 댓글을 1개 작성하세요.',secret:false,condition:a=>num(a,'comments')>=1,progress:a=>prog(num(a,'comments'),1)},
  {id:'first_like',category:'참여',name:'첫공감',icon:'♥',tier:'STANDARD',desc:'좋은 의견에 첫 공감을 보낸 시민',hint:'정뮤니티 또는 IT’S ME 게시글에 좋아요를 1회 보내세요.',secret:false,condition:a=>num(a,'likesGiven')>=1,progress:a=>prog(num(a,'likesGiven'),1)},
  {id:'first_follower',category:'영향력',name:'첫 팬',icon:'👤',tier:'STANDARD',desc:'나를 지켜보는 첫 팔로워를 만든 시민',hint:'다른 회원에게 첫 팔로우를 받아보세요.',secret:false,condition:a=>num(a,'followers')>=1,progress:a=>prog(num(a,'followers'),1)},
  {id:'missionary',category:'영향력',name:'정도사',icon:'📢',tier:'STANDARD',desc:'정참시를 새로운 시민들에게 직접 소개한 전파자',hint:'유효 추천회원 5명을 달성하세요.',secret:false,condition:a=>num(a,'referralValid')>=5,progress:a=>prog(num(a,'referralValid'),5)},
  {id:'invisible_hand',category:'히든',name:'보이지 않는 손',icon:'🫥',tier:'PLATINUM',desc:'보이지 않는 곳에서 50명의 새로운 시민이 정참시를 시작하게 한 사람',hint:'???',secret:true,condition:a=>num(a,'referralValid')>=50,progress:a=>prog(num(a,'referralValid'),50)},
  {id:'seven_day',category:'생활',name:'위크맨',icon:'🗓️',tier:'STANDARD',desc:'일주일 연속 정참시를 지킨 꾸준한 시민',hint:'7일 연속 로그인 방문 기록을 남기세요.',secret:false,condition:a=>streak(a)>=7,progress:a=>prog(streak(a),7)},
  {id:'superhero',category:'생활',name:'슈퍼히어로',icon:'🦸',tier:'STANDARD',desc:'한 달을 하루도 빠짐없이 정참시와 함께한 시민',hint:'달력 한 달을 매일 출석하면 획득합니다.',secret:false,condition:a=>perfectMonth(a),progress:a=>perfectMonthProgress(a)},
  {id:'explorer',category:'탐험',name:'정참시 탐험가',icon:'🧭',tier:'STANDARD',desc:'정참시의 핵심 공간을 모두 둘러본 시민',hint:'NOW · 정뮤니티 · IT’S ME · COLUMN · 비교분석 · MY를 모두 방문하세요.',secret:false,condition:a=>['ranking','community','itsme','news','compare','my'].every(x=>a.pages?.[x]),progress:a=>{const n=['ranking','community','itsme','news','compare','my'].filter(x=>a.pages?.[x]).length;return prog(n,6)}},
  {id:'compare_five',category:'탐험',name:'비교분석가',icon:'⇄',tier:'STANDARD',desc:'정치인을 데이터로 비교해본 분석 시민',hint:'비교분석을 5회 실행하세요.',secret:false,condition:a=>num(a,'compareRuns')>=5,progress:a=>prog(num(a,'compareRuns'),5)},
  {id:'lunch_secret',category:'히든',name:'도시락 알리미',icon:'🍱',tier:'STANDARD',desc:'점심 12시, 정치도 한 숟갈 챙긴 시민',hint:'???',secret:true,condition:a=>Boolean(a.flags?.lunch),progress:a=>({current:a.flags?.lunch?1:0,target:1,percent:a.flags?.lunch?100:0})},
  {id:'cinderella_secret',category:'히든',name:'신데렐라',icon:'👠',tier:'STANDARD',desc:'모두가 잠든 자정, 정참시를 찾은 시민',hint:'???',secret:true,condition:a=>Boolean(a.flags?.cinderella),progress:a=>({current:a.flags?.cinderella?1:0,target:1,percent:a.flags?.cinderella?100:0})},
  {id:'itsme_first',category:'IT’S ME',name:'정책제안자',icon:'💡',tier:'STANDARD',desc:'IT’S ME에서 첫 정책을 제안한 시민',hint:'IT’S ME 게시글을 1개 작성하세요.',secret:false,condition:a=>num(a,'itsmePosts')>=1,progress:a=>prog(num(a,'itsmePosts'),1)},
  {id:'role_assembly',category:'IT’S ME',name:'국회의원 챌린저',icon:'🏛️',tier:'STANDARD',desc:'“잇츠미? 국회의원!”에 정책을 제안한 시민',hint:'국회의원 말머리로 IT’S ME 글을 작성하세요.',secret:false,condition:a=>numRole(a,'국회의원')>=1,progress:a=>prog(numRole(a,'국회의원'),1)},
  {id:'role_president',category:'IT’S ME',name:'대통령 챌린저',icon:'🇰🇷',tier:'STANDARD',desc:'“잇츠미? 대통령!”에 국가 운영안을 제안한 시민',hint:'대통령 말머리로 IT’S ME 글을 작성하세요.',secret:false,condition:a=>numRole(a,'대통령')>=1,progress:a=>prog(numRole(a,'대통령'),1)},
  {id:'role_mayor',category:'IT’S ME',name:'시장 챌린저',icon:'🏙️',tier:'STANDARD',desc:'“잇츠미? 시장!”에 도시 정책을 제안한 시민',hint:'시장 말머리로 IT’S ME 글을 작성하세요.',secret:false,condition:a=>numRole(a,'시장')>=1,progress:a=>prog(numRole(a,'시장'),1)},
  {id:'role_minister',category:'IT’S ME',name:'장관 챌린저',icon:'📑',tier:'STANDARD',desc:'“잇츠미? 장관!”에 분야 정책을 제안한 시민',hint:'장관 말머리로 IT’S ME 글을 작성하세요.',secret:false,condition:a=>numRole(a,'장관')>=1,progress:a=>prog(numRole(a,'장관'),1)},
  {id:'role_council',category:'IT’S ME',name:'시의원 챌린저',icon:'🏘️',tier:'STANDARD',desc:'“잇츠미? 시의원!”에 생활정책을 제안한 시민',hint:'시의원 말머리로 IT’S ME 글을 작성하세요.',secret:false,condition:a=>numRole(a,'시의원')>=1,progress:a=>prog(numRole(a,'시의원'),1)},
  {id:'column_first',category:'칼럼',name:'첫 칼럼',icon:'🖋️',tier:'STANDARD',desc:'정참시 COLUMN에 첫 글을 발행한 작가',hint:'PRO 이상 권한으로 정참시 COLUMN 글을 1개 발행하세요.',secret:false,condition:a=>num(a,'columns')>=1,progress:a=>prog(num(a,'columns'),1)},
  {id:'storyteller',category:'정뮤니티',name:'이야기꾼',icon:'📚',tier:'STANDARD',desc:'정뮤니티에 꾸준히 이야기를 쌓은 시민',hint:'정뮤니티 게시글을 10개 작성하세요.',secret:false,condition:a=>num(a,'communityPosts')>=10,progress:a=>prog(num(a,'communityPosts'),10)},
  {id:'comment_crafter',category:'토론',name:'댓글 장인',icon:'🧵',tier:'STANDARD',desc:'대화를 이어가며 토론의 밀도를 높인 시민',hint:'댓글을 50개 작성하세요.',secret:false,condition:a=>num(a,'comments')>=50,progress:a=>prog(num(a,'comments'),50)},
  {id:'empathy_maker',category:'영향력',name:'공감메이커',icon:'💚',tier:'STANDARD',desc:'내 글과 정책이 시민의 공감을 꾸준히 얻은 회원',hint:'작성한 콘텐츠에서 좋아요 20개를 받아보세요.',secret:false,condition:a=>num(a,'likesReceived')>=20,progress:a=>prog(num(a,'likesReceived'),20)},
  {id:'policy_lab',category:'IT’S ME',name:'정책연구원',icon:'🔬',tier:'STANDARD',desc:'한 번의 아이디어를 넘어 여러 정책을 실험한 시민',hint:'IT’S ME 정책을 5개 제안하세요.',secret:false,condition:a=>num(a,'itsmePosts')>=5,progress:a=>prog(num(a,'itsmePosts'),5)},
  {id:'compare_master',category:'탐험',name:'비교의 달인',icon:'⚖️',tier:'STANDARD',desc:'정치인을 다양한 축으로 반복 비교한 데이터 시민',hint:'비교분석을 20회 실행하세요.',secret:false,condition:a=>num(a,'compareRuns')>=20,progress:a=>prog(num(a,'compareRuns'),20)},
  {id:'thirty_streak',category:'생활',name:'철인 시민',icon:'🏃',tier:'STANDARD',desc:'30일 연속 정참시를 찾은 꾸준한 시민',hint:'30일 연속 로그인 방문을 기록하세요.',secret:false,condition:a=>streak(a)>=30,progress:a=>prog(streak(a),30)},
  {id:'regular_100',category:'생활',name:'정참시 단골',icon:'☕',tier:'STANDARD',desc:'정참시를 생활처럼 찾아온 단골 시민',hint:'로그인 방문 기록 100회를 달성하세요.',secret:false,condition:a=>num(a,'visits')>=100,progress:a=>prog(num(a,'visits'),100)},
  {id:'news_reader',category:'칼럼',name:'칼럼 단골',icon:'📰',tier:'STANDARD',desc:'정참시 칼럼을 꾸준히 찾은 독자',hint:'정참시 COLUMN 화면을 10회 방문하세요.',secret:false,condition:a=>Number(a?.pages?.news||0)>=10,progress:a=>prog(Number(a?.pages?.news||0),10)},
  {id:'earlybird_secret',category:'히든',name:'얼리버드',icon:'🌅',tier:'STANDARD',desc:'아침 6~7시, 하루의 정치를 먼저 연 시민',hint:'???',secret:true,condition:a=>Boolean(a.flags?.earlybird),progress:a=>prog(a.flags?.earlybird?1:0,1)},
  {id:'owl_secret',category:'히든',name:'올빼미 시민',icon:'🦉',tier:'STANDARD',desc:'새벽 2~4시에도 정참시의 불을 지킨 시민',hint:'???',secret:true,condition:a=>Boolean(a.flags?.owl),progress:a=>prog(a.flags?.owl?1:0,1)}
];

const TIER_FAMILIES={
  community:{category:'정뮤니티',name:'정뮤니티 활동가',icon:'📣',desc:'꾸준히 글과 대화를 만드는 커뮤니티 시민',min:3,score:a=>num(a,'communityPosts')*5+num(a,'comments')+num(a,'likesReceived')*2},
  debate:{category:'토론',name:'토론가',icon:'🗣️',desc:'댓글과 토론으로 논의를 깊게 만드는 시민',min:5,score:a=>num(a,'comments')+num(a,'itsmeComments')*1.5},
  influencer:{category:'영향력',name:'인플루언서',icon:'👥',desc:'팔로워와 공감으로 사람을 모으는 영향력 시민',min:1,score:a=>num(a,'followers')*10+num(a,'likesReceived')},
  columnist:{category:'칼럼',name:'칼럼작가',icon:'✒️',desc:'정치·정책을 글로 해석하고 독자에게 전달하는 작가',min:1,score:a=>num(a,'columns')*10+num(a,'articleReactions')*2},
  policy:{category:'IT’S ME',name:'정책설계자',icon:'🏗️',desc:'정책 제안과 시민 반응으로 대안을 만드는 시민',min:1,score:a=>num(a,'itsmePosts')*10+num(a,'likesReceived')*3+num(a,'commentsReceived')*2}
};

const MANUAL_BADGES=[
  {id:'challenge_winner',category:'명예',name:'IT’S ME 시즌 우승자',icon:'🏆',tier:'GOLD',desc:'IT’S ME 시즌에서 최종 우승한 시민',manual:true},
  {id:'citizen_legislator',category:'명예',name:'시민입법가',icon:'⚖️',tier:'PLATINUM',desc:'정책 제안이 공식 정책 검토 단계에 진입한 시민',manual:true},
  {id:'policy_delivery',category:'명예',name:'국회 전달',icon:'📨',tier:'GOLD',desc:'정참시 정책브리프가 국회·정당 정책조직에 공식 전달된 시민',manual:true},
  {id:'first_penguin',category:'칼럼',name:'퍼스트팽귄',icon:'🐧',tier:'GOLD',desc:'정참시 칼럼 생태계의 문을 먼저 연 선도 작가',manual:true},
  {id:'real_policy',category:'LEGACY',name:'REAL POLICY',icon:'🏛️',tier:'PLATINUM',desc:'정참시 제안이 실제 정책·법안 논의에 반영된 시민',manual:true},
  {id:'first_discoverer',category:'히든',name:'FIRST DISCOVERER',icon:'🔓',tier:'GOLD',desc:'새로운 히든배지의 최초 발견자로 기록된 시민',manual:true}
];

function num(a,k){return Number(a?.counts?.[k]||0)}
function numRole(a,k){return Number(a?.roles?.[k]||0)}
function prog(current,target){const c=Math.max(0,Number(current||0)),t=Math.max(1,Number(target||1));return {current:c,target:t,percent:Math.max(0,Math.min(100,Math.round(c/t*100)))}}
function kstParts(d=new Date()){
  const x=new Date(d.getTime()+9*3600000);
  return {y:x.getUTCFullYear(),m:x.getUTCMonth()+1,d:x.getUTCDate(),hh:x.getUTCHours(),mm:x.getUTCMinutes(),ss:x.getUTCSeconds(),date:`${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}-${String(x.getUTCDate()).padStart(2,'0')}`,month:`${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}`};
}
function activityKey(id){return `jjdd:badge:activity:${String(id)}`}
function stateKey(id){return `jjdd:badge:user:${String(id)}`}
function leaderKey(f){return `jjdd:badge:leader:${f}`}
function followersKey(id){return `jjdd:badge:followers:${String(id)}`}
function followingKey(id){return `jjdd:badge:following:${String(id)}`}
function defaultActivity(){return {schemaVersion:BADGE_SCHEMA,counts:{},roles:{},pages:{},flags:{},attendanceDays:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
function defaultState(){return {schemaVersion:BADGE_SCHEMA,autoAwards:{},manualAwards:{},revoked:{},highestTiers:{},representative:null,updatedAt:new Date().toISOString()}}
async function getActivity(id){return (await getJSON(activityKey(id)).catch(()=>null))||defaultActivity()}
async function getState(id){return (await getJSON(stateKey(id)).catch(()=>null))||defaultState()}
function streak(a){
  const days=[...new Set((a?.attendanceDays||[]).filter(Boolean))].sort();if(!days.length)return 0;
  let best=1,cur=1;for(let i=1;i<days.length;i++){const prev=new Date(days[i-1]+'T00:00:00Z'),now=new Date(days[i]+'T00:00:00Z');const dd=Math.round((now-prev)/86400000);if(dd===1){cur++;best=Math.max(best,cur)}else if(dd>1)cur=1;}return best;
}
function perfectMonth(a){return perfectMonthInfo(a).perfect}
function perfectMonthInfo(a){
  const groups={};for(const day of (a?.attendanceDays||[])){const m=String(day).slice(0,7);(groups[m]||(groups[m]=new Set())).add(day)}
  const now=kstParts();let best={perfect:false,current:0,target:new Date(now.y,now.m,0).getDate(),month:now.month};
  for(const [m,s] of Object.entries(groups)){const [y,mo]=m.split('-').map(Number),target=new Date(y,mo,0).getDate();if(s.size===target)return {perfect:true,current:target,target,month:m};if(s.size>best.current)best={perfect:false,current:s.size,target,month:m};}
  return best;
}
function perfectMonthProgress(a){const x=perfectMonthInfo(a);return prog(x.current,x.target)}
function tierStyle(tier){return ({STANDARD:'standard',SILVER:'silver',GOLD:'gold',PLATINUM:'platinum',HONOR:'honor',LEGACY:'legacy'})[tier]||'standard'}
function tierBadgeId(family,tier){return `tier_${family}_${String(tier).toLowerCase()}`}
function tierCatalogItem(family,tier){const f=TIER_FAMILIES[family];return {id:tierBadgeId(family,tier),family,category:f.category,name:f.name,icon:f.icon,tier,desc:f.desc,manual:false}}
function allCatalog(){const tiers=[];for(const fam of Object.keys(TIER_FAMILIES))for(const t of ['STANDARD','SILVER','GOLD','PLATINUM'])tiers.push(tierCatalogItem(fam,t));return [...FIXED_BADGES.map(stripFn),...tiers,...MANUAL_BADGES]}
function stripFn(b){const {condition,progress,...rest}=b;return rest}
let configCache=null,configCacheAt=0;
async function getConfig(){if(configCache&&Date.now()-configCacheAt<30000)return configCache;configCache=(await getJSON(CONFIG_KEY).catch(()=>null))||{disabled:[],updatedAt:null};configCacheAt=Date.now();return configCache}
async function saveConfig(next){const known=new Set(allCatalog().map(x=>String(x.id))),disabled=Array.isArray(next?.disabled)?[...new Set(next.disabled.map(String).filter(id=>known.has(id)))]:[];const cfg={disabled,updatedAt:new Date().toISOString()};await setJSON(CONFIG_KEY,cfg);configCache=cfg;configCacheAt=Date.now();return cfg}
function isDisabled(cfg,id){return (cfg?.disabled||[]).includes(String(id))}

async function updateLeaderboards(userId,a){
  for(const [family,f] of Object.entries(TIER_FAMILIES)){
    const score=Math.max(0,Number(f.score(a)||0));
    await cmd(['ZADD',leaderKey(family),String(score),String(userId)]).catch(()=>{});
  }
}
async function recordActivity(userId,type,amount=1,meta={}){
  if(!userId||String(userId).startsWith('admin:'))return null;
  const a=await getActivity(userId);a.counts=a.counts||{};a.roles=a.roles||{};a.pages=a.pages||{};a.flags=a.flags||{};
  const n=Number(amount||0);
  if(type==='visit'){
    const visitAt=meta.now?new Date(meta.now):new Date(),lastCounted=Date.parse(a.lastCountedVisitAt||'');
    if(!Number.isFinite(lastCounted)||visitAt.getTime()-lastCounted>=30*60*1000){a.counts.visits=Math.max(0,Number(a.counts.visits||0)+Math.max(1,n));a.lastCountedVisitAt=visitAt.toISOString();}
    a.lastVisitAt=visitAt.toISOString();
    const k=kstParts(visitAt);if(!(a.attendanceDays||[]).includes(k.date))a.attendanceDays=[...(a.attendanceDays||[]),k.date].slice(-420);
    const sec=k.hh*3600+k.mm*60+k.ss;
    if(sec>=11*3600+59*60+30&&sec<=12*3600+59)a.flags.lunch=true;
    if(sec>=23*3600+59*60+30||sec<=59)a.flags.cinderella=true;
    if(k.hh>=6&&k.hh<8)a.flags.earlybird=true;
    if(k.hh>=2&&k.hh<5)a.flags.owl=true;
  }else if(type==='pageView'){
    const page=String(meta.page||'').slice(0,30);if(page){a.pages[page]=Number(a.pages[page]||0)+1;a.counts.pageViews=Number(a.counts.pageViews||0)+1;}
  }else if(type==='itsmeRole'){
    const role=String(meta.role||'').slice(0,20);if(role)a.roles[role]=Number(a.roles[role]||0)+Math.max(1,n);
  }else{
    a.counts[type]=Math.max(0,Number(a.counts[type]||0)+n);
  }
  a.updatedAt=new Date().toISOString();await setJSON(activityKey(userId),a);await updateLeaderboards(userId,a);await refreshAwards(userId,a);return a;
}
async function setCounter(userId,key,value){const a=await getActivity(userId);a.counts=a.counts||{};a.counts[key]=Math.max(0,Number(value||0));a.updatedAt=new Date().toISOString();await setJSON(activityKey(userId),a);await updateLeaderboards(userId,a);await refreshAwards(userId,a);return a}
async function recordVisit(userId){return recordActivity(userId,'visit',1)}
async function recordPageView(userId,page){return recordActivity(userId,'pageView',1,{page})}

async function tierNow(userId,family,a){
  const f=TIER_FAMILIES[family],score=Math.max(0,Number(f.score(a)||0));if(score<f.min)return {tier:null,score,rank:null,total:0,percentile:null};
  const total=Number(await cmd(['ZCOUNT',leaderKey(family),String(f.min),'+inf']).catch(()=>0)||0);
  if(total<20)return {tier:'STANDARD',score,rank:null,total,percentile:null,forming:true};
  const rankRaw=await cmd(['ZREVRANK',leaderKey(family),String(userId)]).catch(()=>null);const rank=rankRaw==null?total-1:Number(rankRaw);const pct=(rank+1)/Math.max(1,total)*100;
  const tier=pct<=1?'PLATINUM':pct<=15?'GOLD':pct<=35?'SILVER':'STANDARD';return {tier,score,rank:rank+1,total,percentile:Number(pct.toFixed(2)),forming:false};
}
async function refreshAwards(userId,activity=null){
  const a=activity||await getActivity(userId),s=await getState(userId),cfg=await getConfig();s.autoAwards=s.autoAwards||{};s.manualAwards=s.manualAwards||{};s.highestTiers=s.highestTiers||{};s.revoked=s.revoked||{};const now=new Date().toISOString();
  for(const b of FIXED_BADGES){
    if(!isDisabled(cfg,b.id)&&b.condition(a)&&!s.autoAwards[b.id]&&!s.revoked[b.id]){
      s.autoAwards[b.id]={at:now};
      if(b.secret){const first=await cmd(['SET',`jjdd:badge:first-discoverer:${b.id}`,String(userId),'NX']).catch(()=>null);if(first==='OK'&&!s.manualAwards.first_discoverer&&!s.revoked.first_discoverer)s.manualAwards.first_discoverer={at:now,note:`${b.name} 최초 발견자`};}
    }
  }
  for(const family of Object.keys(TIER_FAMILIES)){
    const current=await tierNow(userId,family,a);if(!current.tier)continue;const prev=s.highestTiers[family];if(!prev||TIER_ORDER[current.tier]>TIER_ORDER[prev.tier])s.highestTiers[family]={tier:current.tier,at:now,score:current.score};
  }
  s.updatedAt=now;await setJSON(stateKey(userId),s);return s;
}
function awardRecordFor(id,s){return s.manualAwards?.[id]||s.autoAwards?.[id]||null}
async function getProfile(userId){
  const [a,cfg]=await Promise.all([getActivity(userId),getConfig()]);let s=await refreshAwards(userId,a);const fixed=FIXED_BADGES.map((b,i)=>{const rec=awardRecordFor(b.id,s),earned=Boolean(rec)&&!s.revoked?.[b.id]&&!isDisabled(cfg,b.id),p=b.progress(a),lockedSecret=b.secret&&!earned;const base=stripFn(b);return {...base,id:lockedSecret?`hidden_${i+1}`:base.id,earned,earnedAt:rec?.at||null,lockedSecret,displayName:lockedSecret?'???':b.name,displayDesc:lockedSecret?'숨겨진 조건을 발견하면 공개됩니다.':b.desc,displayHint:lockedSecret?'조건 비공개':b.hint,progress:lockedSecret?null:p,style:tierStyle(b.tier)}});
  const families=[];
  for(const family of Object.keys(TIER_FAMILIES)){
    const f=TIER_FAMILIES[family],now=await tierNow(userId,family,a),hist=s.highestTiers?.[family]||null,arr=['STANDARD','SILVER','GOLD','PLATINUM'];
    const manualTiers=arr.filter(t=>{const id=tierBadgeId(family,t);return Boolean(s.manualAwards?.[id])&&!s.revoked?.[id]&&!isDisabled(cfg,id)});
    const manualTier=manualTiers.sort((x,y)=>TIER_ORDER[y]-TIER_ORDER[x])[0]||null;
    const candidates=[hist?.tier,now.tier,manualTier].filter(Boolean).filter(t=>{const id=tierBadgeId(family,t);return !s.revoked?.[id]&&!isDisabled(cfg,id)});
    const currentTier=candidates.sort((x,y)=>TIER_ORDER[y]-TIER_ORDER[x])[0]||null;let next=null;if(currentTier){const idx=arr.indexOf(currentTier);next=arr[idx+1]||null;}
    const tierId=currentTier?tierBadgeId(family,currentTier):null,earned=Boolean(currentTier);
    const earnedAt=tierId?(s.manualAwards?.[tierId]?.at||(hist?.tier===currentTier?hist?.at:null)||null):null;
    families.push({family,category:f.category,name:f.name,icon:f.icon,desc:f.desc,currentTier,style:tierStyle(currentTier||'STANDARD'),score:now.score,rank:now.rank,total:now.total,percentile:now.percentile,forming:now.forming,earned,earnedAt,nextTier:next,rule:now.forming?'활동회원 20명 이상부터 상위 35% SILVER · 15% GOLD · 1% PLATINUM을 적용합니다.':'상위 35% SILVER · 상위 15% GOLD · 상위 1% PLATINUM'});
  }
  const manual=MANUAL_BADGES.map(b=>{const rec=s.manualAwards?.[b.id],earned=Boolean(rec)&&!s.revoked?.[b.id]&&!isDisabled(cfg,b.id);return {...b,earned,earnedAt:rec?.at||null,note:rec?.note||'',style:tierStyle(b.tier)}});
  const earnedFixed=fixed.filter(x=>x.earned),earnedManual=manual.filter(x=>x.earned),earnedFamilies=families.filter(x=>x.earned);const earnedCount=earnedFixed.length+earnedManual.length+earnedFamilies.length;const totalCount=FIXED_BADGES.length+MANUAL_BADGES.length+Object.keys(TIER_FAMILIES).length;
  let representative=s.representative||null;
  const validIds=new Set([...earnedFixed.map(x=>x.id),...earnedManual.map(x=>x.id),...earnedFamilies.map(x=>tierBadgeId(x.family,x.currentTier))]);if(representative&&!validIds.has(representative.id))representative=null;
  return {ok:true,activity:a,attendance:{streak:streak(a),perfectMonth:perfectMonthInfo(a)},fixed,families,manual,earnedCount,totalCount,representative,followers:num(a,'followers'),following:num(a,'following')};
}
async function setRepresentative(userId,badgeId){
  const profile=await getProfile(userId),id=String(badgeId||'');let item=profile.fixed.find(x=>x.id===id&&x.earned)||profile.manual.find(x=>x.id===id&&x.earned)||profile.families.find(x=>tierBadgeId(x.family,x.currentTier)===id&&x.earned);if(!item)throw new Error('획득한 배지만 대표배지로 설정할 수 있습니다.');
  const rep=item.family?{id,name:item.name,tier:item.currentTier,icon:item.icon,category:item.category,style:tierStyle(item.currentTier)}:{id:item.id,name:item.name,tier:item.tier,icon:item.icon,category:item.category,style:tierStyle(item.tier)};const s=await getState(userId);s.representative=rep;s.updatedAt=new Date().toISOString();await setJSON(stateKey(userId),s);return rep;
}
async function clearRepresentative(userId){const s=await getState(userId);s.representative=null;s.updatedAt=new Date().toISOString();await setJSON(stateKey(userId),s);return null}
async function getRepresentativeBadge(userId){if(!userId||String(userId).startsWith('admin:'))return null;const [s,cfg]=await Promise.all([getState(userId),getConfig()]);const rep=s.representative||null;return rep&&!isDisabled(cfg,rep.id)&&!s.revoked?.[rep.id]?rep:null}
async function getRepresentativeBadges(userIds=[]){
  const ids=[...new Set((userIds||[]).map(String).filter(x=>x&&!x.startsWith('admin:')))];const out={};if(!ids.length)return out;const cfg=await getConfig();let vals=null;
  try{vals=await cmd(['MGET',...ids.map(stateKey)]);}catch(_){}
  if(Array.isArray(vals)&&vals.length===ids.length){for(let i=0;i<ids.length;i++){const s=parseJSONValue(vals[i])||defaultState(),rep=s.representative||null;out[ids[i]]=rep&&!isDisabled(cfg,rep.id)&&!s.revoked?.[rep.id]?rep:null;}return out;}
  await Promise.all(ids.map(async id=>{out[id]=await getRepresentativeBadge(id).catch(()=>null);}));return out;
}
async function follow(userId,targetId,enabled=true){
  const a=String(userId||''),b=String(targetId||'');if(!a||!b||a===b)throw new Error('팔로우 대상을 확인해주세요.');
  if(enabled){await cmd(['SADD',followingKey(a),b]);await cmd(['SADD',followersKey(b),a]);}else{await cmd(['SREM',followingKey(a),b]);await cmd(['SREM',followersKey(b),a]);}
  const [fc,gc]=await Promise.all([cmd(['SCARD',followersKey(b)]).catch(()=>0),cmd(['SCARD',followingKey(a)]).catch(()=>0)]);await Promise.all([setCounter(b,'followers',fc),setCounter(a,'following',gc)]);return {following:enabled,followers:Number(fc||0)};
}
async function getAuthorSocialStates(viewerId,userIds=[]){
  const ids=[...new Set((userIds||[]).map(String).filter(x=>x&&!x.startsWith('admin:')))];const out={};if(!ids.length)return out;
  let activities=null,following=[];
  try{activities=await cmd(['MGET',...ids.map(activityKey)]);}catch(_){}
  if(viewerId){try{following=await cmd(['SMEMBERS',followingKey(viewerId)])||[];}catch(_){following=[];}}
  const followingSet=new Set((following||[]).map(String));
  for(let i=0;i<ids.length;i++){
    const a=Array.isArray(activities)?parseJSONValue(activities[i]):null;
    out[ids[i]]={following:followingSet.has(ids[i]),followers:Number(a?.counts?.followers||0)};
  }
  return out;
}
async function followState(userId,targetId){if(!targetId)return {following:false,followers:0};const [is,fc]=await Promise.all([userId?cmd(['SISMEMBER',followingKey(userId),String(targetId)]).catch(()=>0):0,cmd(['SCARD',followersKey(targetId)]).catch(()=>0)]);return {following:Boolean(Number(is)),followers:Number(fc||0)}}
async function manualAward(userId,badgeId,note=''){
  const uid=String(userId||'').trim();if(!uid)throw new Error('회원 ID가 없습니다.');const catalog=allCatalog(),b=catalog.find(x=>x.id===String(badgeId));if(!b)throw new Error('배지 ID가 올바르지 않습니다.');const s=await getState(uid);s.manualAwards=s.manualAwards||{};s.revoked=s.revoked||{};delete s.revoked[b.id];s.manualAwards[b.id]={at:new Date().toISOString(),note:String(note||'').slice(0,240)};s.updatedAt=new Date().toISOString();await setJSON(stateKey(uid),s);return getProfile(uid);
}
async function revokeBadge(userId,badgeId,note=''){
  const uid=String(userId||'').trim(),id=String(badgeId||'').trim();if(!uid||!id)throw new Error('회원 ID와 배지 ID를 확인해주세요.');const s=await getState(uid);s.revoked=s.revoked||{};s.revoked[id]={at:new Date().toISOString(),note:String(note||'').slice(0,240)};if(s.representative?.id===id)s.representative=null;s.updatedAt=new Date().toISOString();await setJSON(stateKey(uid),s);return getProfile(uid);
}
function defaultSeason(){
  const k=kstParts(),last=new Date(Date.UTC(k.y,k.m,0,14,59,59)); // KST month last day 23:59:59
  return {enabled:true,id:`${k.y}-${String(k.m).padStart(2,'0')}`,title:`${k.y}년 ${k.m}월 IT’S ME 시민정책 챌린지`,theme:'내가 정치의 주인공이라면, 무엇부터 바꾸겠습니까?',startAt:`${k.y}-${String(k.m).padStart(2,'0')}-01T00:00:00+09:00`,endAt:last.toISOString(),reward:'월간 우수정책 · 정참시 공식 배지 및 포상',roles:['국회의원','대통령','시장','장관','시의원'],updatedAt:null};
}
async function getSeasonConfig(){return (await getJSON(SEASON_KEY).catch(()=>null))||defaultSeason()}
async function saveSeasonConfig(input){const cur=await getSeasonConfig(),roles=Array.isArray(input?.roles)?input.roles.map(v=>String(v).trim()).filter(Boolean).slice(0,10):cur.roles;const next={...cur,enabled:input?.enabled!==false,title:String(input?.title||cur.title).trim().slice(0,100),theme:String(input?.theme||cur.theme).trim().slice(0,220),startAt:String(input?.startAt||cur.startAt),endAt:String(input?.endAt||cur.endAt),reward:String(input?.reward||cur.reward).trim().slice(0,180),roles:roles.length?roles:cur.roles,updatedAt:new Date().toISOString()};if(!Date.parse(next.startAt)||!Date.parse(next.endAt)||Date.parse(next.endAt)<=Date.parse(next.startAt))throw new Error('시즌 시작/종료 일시를 확인해주세요.');next.id=String(input?.id||cur.id||Date.now()).slice(0,60);await setJSON(SEASON_KEY,next);return next}
async function clearUserData(userId){
  const id=String(userId||'');
  if(!id)return;
  const [followers,following]=await Promise.all([
    cmd(['SMEMBERS',followersKey(id)]).catch(()=>[]),
    cmd(['SMEMBERS',followingKey(id)]).catch(()=>[])
  ]);
  await Promise.all([
    ...(followers||[]).map(f=>cmd(['SREM',followingKey(f),id]).catch(()=>{})),
    ...(following||[]).map(t=>cmd(['SREM',followersKey(t),id]).catch(()=>{}))
  ]);
  for(const f of (followers||[])){
    const count=Number(await cmd(['SCARD',followingKey(f)]).catch(()=>0)||0);
    await setCounter(f,'following',count).catch(()=>{});
  }
  for(const t of (following||[])){
    const count=Number(await cmd(['SCARD',followersKey(t)]).catch(()=>0)||0);
    await setCounter(t,'followers',count).catch(()=>{});
  }
  await Promise.all([
    cmd(['DEL',activityKey(id)]).catch(()=>{}),
    cmd(['DEL',stateKey(id)]).catch(()=>{}),
    cmd(['DEL',followersKey(id)]).catch(()=>{}),
    cmd(['DEL',followingKey(id)]).catch(()=>{})
  ]);
  for(const f of Object.keys(TIER_FAMILIES))await cmd(['ZREM',leaderKey(f),id]).catch(()=>{});
}

module.exports={BADGE_SCHEMA,FIXED_BADGES,TIER_FAMILIES,MANUAL_BADGES,allCatalog,getActivity,getState,getConfig,saveConfig,getProfile,recordActivity,recordVisit,recordPageView,setCounter,setRepresentative,clearRepresentative,getRepresentativeBadge,getRepresentativeBadges,getAuthorSocialStates,follow,followState,manualAward,revokeBadge,getSeasonConfig,saveSeasonConfig,clearUserData,tierBadgeId,tierStyle};
