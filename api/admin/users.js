const {requireAdmin}=require('../../lib/auth');
const {cmd,getJSON,setJSON}=require('../../lib/store');
const {
  ROLES,userKey,publicUser,normalizeUsername,validateUsername,validatePassword,
  usernameIndexKey,hashPassword
}=require('../../lib/user_auth');

async function getUser(id){ return id ? getJSON(userKey(id)) : null; }

const DEMO_MEMBER_COUNT=150;
const DEMO_NICKS=[
  '오늘도맑음','소소한일상','한강산책','책읽는곰','동네한바퀴','커피한잔','아침산책','파란하늘','초록나무','마음산책',
  '퇴근길','주말등산','동네소식','한표의무게','보통시민','집앞카페','느린기록','생각노트','서쪽하늘','봄날',
  '가을바람','여름밤','노을','라온','하루','모모','윤슬','해솔','다온','마루','호두','단비','두부','몽실','낮달',
  '새벽공기','오후네시','작은숲','바람결','온기','산책중','뉴스읽기','정책메모','우리동네','도시산책','주말기록',
  '고양이집사','강아지산책','커피좋아','책한권','오늘의기록','느린오후','서울살이','경기남부','인천바람','부산갈매기',
  '대전사람','광주일상','제주바람','수원시민','용인사는사람','고양일상','성남산책','화성살이','안양사람','김포라이프',
  '준호아빠','서연맘','민준파파','지우네','수진씨','현우네','재민아빠','도윤맘','하린이네','상민형','은채맘','승우아빠','예진네',
  'bluebird','sunnyday','coffee77','mango','olive','maple','riverwalk','dailynote','citywalker','slowday','morninglog','skyblue','greenmile','weekend'
];
const ID_ROOTS=['hanriver','marunote','greenstep','westsky','afternoon','townwalk','bluehour','moonlight','summerrain','coffeeone','morningray','sunsetnote','smallforest','springday','windline','sodam','yoonseul','raonday','haesol','daonlog','lurinote','river','mango','bluejay','urbanread','oliveview','maplelog','jpark','hkim','mlee','schoi','minpark','dailywalk','citynote','goodday','nearby','slowstep','sunnylog','openmind','weekend'];
function seeded(n){let x=(n+1)*2654435761>>>0;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296;};}
function pick(a,r){return a[Math.floor(r()*a.length)%a.length];}
function digits(r,min=10,max=99){return Math.floor(min+r()*(max-min+1));}
function maskLocal(local){const s=String(local||'user').replace(/[^a-z0-9._-]/gi,'').toLowerCase()||'user';if(s.length<=3)return `${s[0]||'u'}***`;return `${s.slice(0,Math.min(3,s.length-1))}${'*'.repeat(Math.min(4,Math.max(2,s.length-3)))}`;}
function demoMember(i){
  const n=Number(i)||0,r=seeded(n+2718);
  let nickname=DEMO_NICKS[n%DEMO_NICKS.length];
  if(n>=DEMO_NICKS.length){
    const style=n%3;
    nickname=style===0?`${nickname}${digits(r,2,88)}`:style===1?`${pick(['오늘','동네','우리','작은','푸른','느린'],r)}${nickname}`:`${nickname}_${digits(r,2,77)}`;
  }
  const root=ID_ROOTS[n%ID_ROOTS.length];
  const cycle=Math.floor(n/ID_ROOTS.length);
  let username=root;
  if(cycle===1)username=`${root}${digits(r,11,98)}`;
  else if(cycle===2)username=`${root}_${digits(r,2,88)}`;
  else if(cycle>=3)username=`${root}${digits(r,100,999)}`;
  username=username.slice(0,20);

  const provider=r()<0.56?'naver.com':'gmail.com';
  const mailRoots=['min','jisu','jh','yuna','seojun','haneul','mira','doyun','eunji','hyun','sora','jin','sun','young','park','kim','lee','choi','han','seo'];
  const mailLocal=`${pick(mailRoots,r)}${r()<0.55?digits(r,2,99):''}`;
  const emailDisplay=`${maskLocal(mailLocal)}@${provider}`;
  const email=`demo-member-${(n*53+107).toString(36)}@example.com`;

  const now=Date.UTC(2026,7,14,23,50,0);
  const ageDays=Math.floor(3+Math.pow(r(),0.72)*205);
  const minuteOffset=Math.floor(r()*1440);
  const createdAt=new Date(now-ageDays*86400000-minuteOffset*60000).toISOString();
  const loginAgeMinutes=Math.floor(Math.pow(r(),2.2)*60*24*72);
  const lastLoginAt=new Date(now-loginAgeMinutes*60000).toISOString();
  const p=r();
  const role=p<0.79?'FREE':p<0.95?'PLUS':'PRO';
  return {
    id:`synthetic-${String(n+1).padStart(3,'0')}`,username,email,emailDisplay,nickname,role,status:'ACTIVE',
    createdAt,updatedAt:lastLoginAt,lastLoginAt,agreements:{},notifications:{enabled:r()>0.22,updatedAt:lastLoginAt},
    capabilities:{free:true,plus:['PLUS','PRO'].includes(role),pro:role==='PRO',admin:false},
    isSynthetic:true,syntheticMark:'*'
  };
}
function syntheticUsers(){ return Array.from({length:DEMO_MEMBER_COUNT},(_,i)=>demoMember(i)); }
function isSyntheticId(id){ return /^synthetic-\d{3}$/.test(String(id||'')); }

module.exports=async function(req,res){
  const admin=requireAdmin(req,res);
  if(!admin) return;

  if(req.method==='GET'){
    const ids=await cmd(['SMEMBERS','jjdd:users']);
    const real=[];
    for(const id of (ids||[]).slice(0,1000)){
      const u=await getUser(id);
      if(u) real.push({...publicUser(u,{includePreference:true}),isSynthetic:false});
    }
    const demos=syntheticUsers();
    const list=[...real,...demos];
    list.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    return res.json({ok:true,users:list,total:list.length,realTotal:real.length,syntheticTotal:demos.length});
  }

  if(req.method==='POST'){
    const b=req.body||{};
    if(isSyntheticId(b.userId)) return res.status(400).json({ok:false,error:'* 표시 시연 데이터는 실제 계정 변경 대상이 아닙니다.'});
    const u=await getUser(b.userId);
    if(!u) return res.status(404).json({ok:false,error:'회원을 찾을 수 없습니다.'});
    const action=String(b.action||'role');

    if(action==='role'){
      const role=String(b.role||'').toUpperCase();
      if(!ROLES.includes(role)) return res.status(400).json({ok:false,error:'유효하지 않은 등급입니다.'});
      u.role=role;u.updatedAt=new Date().toISOString();u.adminAccountUpdatedAt=u.updatedAt;u.adminAccountUpdatedBy=String(admin.id||'admin');
      await setJSON(userKey(u.id),u);
      return res.json({ok:true,user:publicUser(u,{includePreference:true})});
    }

    if(action==='update-account'){
      const role=String(b.role||u.role||'FREE').toUpperCase();
      if(!ROLES.includes(role)) return res.status(400).json({ok:false,error:'유효하지 않은 등급입니다.'});
      const nextUsername=normalizeUsername(b.username);
      if(!validateUsername(nextUsername)) return res.status(400).json({ok:false,error:'아이디는 영문·숫자·밑줄(_)만 사용해 4~20자로 입력해주세요.'});
      const prevUsername=normalizeUsername(u.username||'');
      const usernameChanged=prevUsername!==nextUsername;
      let reservedNew=false;
      if(usernameChanged){
        const idx=usernameIndexKey(nextUsername);
        const existing=await cmd(['GET',idx]);
        if(existing && String(existing)!==String(u.id)) return res.status(409).json({ok:false,error:'이미 사용 중인 아이디입니다.'});
        if(!existing){
          const r=await cmd(['SET',idx,u.id,'NX']);
          if(r!=='OK') return res.status(409).json({ok:false,error:'이미 사용 중인 아이디입니다.'});
          reservedNew=true;
        }
      }
      const before={username:u.username,role:u.role};
      try{
        u.username=nextUsername;u.role=role;u.updatedAt=new Date().toISOString();
        u.adminAccountUpdatedAt=u.updatedAt;u.adminAccountUpdatedBy=String(admin.id||'admin');
        await setJSON(userKey(u.id),u);
        if(usernameChanged && prevUsername) await cmd(['DEL',usernameIndexKey(prevUsername)]);
      }catch(e){
        u.username=before.username;u.role=before.role;
        if(reservedNew) await cmd(['DEL',usernameIndexKey(nextUsername)]).catch(()=>{});
        throw e;
      }
      return res.json({ok:true,user:publicUser(u,{includePreference:true}),usernameChanged});
    }

    if(action==='reset-password'){
      const p=String(b.newPassword||'');
      if(!validatePassword(p)) return res.status(400).json({ok:false,error:'새 비밀번호는 8자 이상 128자 이하로 입력해주세요.'});
      u.passwordHash=await hashPassword(p);
      u.sessionVersion=Number(u.sessionVersion||1)+1;
      u.updatedAt=new Date().toISOString();
      u.adminPasswordResetAt=u.updatedAt;u.adminPasswordResetBy=String(admin.id||'admin');
      await setJSON(userKey(u.id),u);
      return res.json({ok:true,resetAt:u.adminPasswordResetAt,sessionInvalidated:true});
    }

    return res.status(400).json({ok:false,error:'지원하지 않는 회원 관리 작업입니다.'});
  }

  return res.status(405).json({ok:false,error:'Method not allowed'});
};
