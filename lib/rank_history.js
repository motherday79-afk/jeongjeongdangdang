const store=require('./store');

const RANK_HISTORY_KEY='jjdd:rank-history:v1';
// 1,500 publication points is comfortably beyond one year at the planned daily anchor,
// while still allowing many manual breaking-news publishes between anchors.
const RANK_HISTORY_MAX_POINTS=1500;

function stampOf(snap={}){
  const pub=Number(snap.publicationId||0);
  if(Number.isFinite(pub)&&pub>0)return pub;
  const iso=Date.parse(snap.publishedAt||'');
  if(Number.isFinite(iso))return iso;
  const kst=String(snap.timestamp||'').replace(' KST','+09:00').replace(' ','T');
  const t=Date.parse(kst);
  return Number.isFinite(t)?t:Date.now();
}

function compactRankPoint(snap={},mode='MANUAL'){
  return {
    v:2,
    publicationId:snap.publicationId||null,
    publishedAt:snap.publishedAt||null,
    timestamp:snap.timestamp||null,
    stamp:stampOf(snap),
    mode:String(mode||'MANUAL').toUpperCase(),
    rosterVersion:snap.rosterVersion||null,
    // [member id, category rank, score, overall rank]. Keep the long-term time series intentionally tiny.
    members:(Array.isArray(snap.members)?snap.members:[])
      .filter(m=>Number.isFinite(Number(m?.id))&&Number.isFinite(Number(m?.rank)))
      .map(m=>[
        Number(m.id),
        Number(m.rank),
        Number.isFinite(Number(m.score))?Math.round(Number(m.score)*10)/10:null,
        Number.isFinite(Number(m.overallRank))?Number(m.overallRank):null
      ])
  };
}

async function appendRankHistory(snap,mode='MANUAL'){
  const point=compactRankPoint(snap,mode);
  await store.lpush(RANK_HISTORY_KEY,JSON.stringify(point));
  await store.ltrim(RANK_HISTORY_KEY,0,RANK_HISTORY_MAX_POINTS-1);
  return point;
}

function parseRankPoint(raw){
  if(!raw)return null;
  if(typeof raw==='object')return raw;
  try{return JSON.parse(raw)}catch(_){return null}
}

module.exports={RANK_HISTORY_KEY,RANK_HISTORY_MAX_POINTS,stampOf,compactRankPoint,appendRankHistory,parseRankPoint};
