function cleanText(s=''){
  return String(s||'')
    .replace(/<[^>]*>/g,' ')
    .replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#39;/g,"'")
    .replace(/^\s*\[(?:속보|단독|종합|포토|영상|인터뷰)\]\s*/,'')
    .replace(/\s+/g,' ').trim();
}
function titleOf(v){return cleanText(typeof v==='string'?v:(v?.title||v?.headline||v?.name||''));}
function timeOf(v){const n=Number(typeof v==='object'&&v?v.ts:0);return Number.isFinite(n)?n:0;}
function sourceOf(v){return String(typeof v==='object'&&v?(v.source||v.provider||''):'').trim();}
function candidateKey(v){return titleOf(v).toLowerCase().replace(/[^0-9a-z가-힣]+/g,' ').trim();}
function memberMatch(member,title){
  const name=String(member?.name||'').trim();if(!name||!title.includes(name))return false;
  if(!member?.ambiguousName)return true;
  const clues=[member.party,member.constituency,member.region,member.office,'국회의원','시장','도지사','구청장','군수'].filter(Boolean).map(String);
  return clues.some(x=>title.includes(x));
}
function collectCandidates(member,signal={},globalNews={},previous=null){
  const rows=[];
  const add=(arr,base,label,requireName=false)=>{
    if(!Array.isArray(arr))return;
    for(const v of arr){const title=titleOf(v);if(!title)continue;if(requireName&&!memberMatch(member,title))continue;rows.push({title,ts:timeOf(v),source:sourceOf(v),base,label});}
  };
  const ch=signal.channels||{};
  add(ch.bigKinds?.headlines,58,'BIG KINDS');
  add(ch.news?.headlines,56,'뉴스 6시간');
  add(ch.news?.headlineCandidates,51,'뉴스 7일');
  add(signal.evidenceItems,44,'수집 근거');
  for(const [key,val] of Object.entries(ch)){
    if(key==='news'||key==='bigKinds'||!val)continue;
    add(val.headlines,36,`${key} 제목`);
    add(val.headlineCandidates,34,`${key} 최근 제목`);
  }
  add(globalNews?.items,40,'전체 정치뉴스',true);
  if(previous?.rankHeadline){rows.push({title:cleanText(previous.rankHeadline),ts:Number(previous.rankHeadlineAt)||0,source:String(previous.rankHeadlineSource||''),base:18,label:'직전 정상 한 줄'});}
  const uniq=new Map();
  for(const r of rows){const k=candidateKey(r.title);if(!k)continue;const p=uniq.get(k);if(!p||r.base>p.base||r.ts>p.ts)uniq.set(k,r);}
  return [...uniq.values()];
}
function scoreCandidate(member,row,now=Date.now()){
  let title=cleanText(row.title);if(title.length<8)return -999;
  let score=Number(row.base||0);
  const name=String(member?.name||'').trim();
  if(name&&title.includes(name))score+=28;
  if(name&&title.indexOf(name)>=0&&title.indexOf(name)<14)score+=7;
  const ageH=row.ts?Math.max(0,(now-row.ts)/3600000):168;
  score+=Math.max(-28,38-Math.min(168,ageH)*0.32);
  if(title.length>=16&&title.length<=76)score+=18;else if(title.length<=96)score+=8;else score-=15;
  if(/[“”"'‘’]/.test(title))score+=6;
  if(/말했다|밝혔다|강조|반박|비판|약속|승복|사퇴|출마|논란|발언|결정|합의|촉구|직격|경고|입장|제안|요구|선언/.test(title))score+=7;
  if(/오늘의|주요뉴스|정치권 소식|브리핑|사진|포토|영상/.test(title))score-=15;
  return score;
}
function formatHeadline(member,title){
  const name=String(member?.name||'').trim();let out=cleanText(title)
    .replace(/\s*[-|·]\s*[^-|·]{2,18}$/,'').trim();
  if(name&&out.startsWith(name)){const t=out.slice(name.length).replace(/^[\s,·:;|\-–—]+/,'').trim();if(t.length>=8)out=t;}
  if(out.length>88)out=out.slice(0,86).replace(/\s+\S*$/,'')+'…';
  return out;
}
function chooseRankHeadline(member,signal={},globalNews={},previous=null,now=Date.now()){
  const scored=collectCandidates(member,signal,globalNews,previous)
    .map(r=>({...r,score:scoreCandidate(member,r,now)}))
    .filter(r=>r.score>-500)
    .sort((a,b)=>b.score-a.score||b.ts-a.ts);
  const best=scored[0];
  if(!best)return {headline:'',source:'',ts:null,kind:'none'};
  return {headline:formatHeadline(member,best.title),source:best.source||best.label||'',ts:best.ts||null,kind:best.label||'candidate'};
}
module.exports={chooseRankHeadline,collectCandidates,formatHeadline};
