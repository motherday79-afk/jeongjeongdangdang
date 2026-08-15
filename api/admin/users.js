const {requireAdmin}=require('../../lib/auth');
const {cmd,getJSON,setJSON}=require('../../lib/store');
const {
  ROLES,userKey,publicUser,normalizeUsername,validateUsername,validatePassword,
  usernameIndexKey,hashPassword
}=require('../../lib/user_auth');

async function getUser(id){ return id ? getJSON(userKey(id)) : null; }

const DEMO_MEMBER_COUNT=150;
const DEMO_NICK_A=['차분한','오늘의','동네','정책','새벽','한걸음','소소한','든든한','맑은','푸른','따뜻한','느긋한','반듯한','활기찬','생각하는'];
const DEMO_NICK_B=['산책러','기록자','한표','독자','이웃','관찰자','토론러','시민','메모장','나침반'];
const DEMO_USER_ROOTS=['seoulwalk','dailyview','policylog','townnote','greenroad','morningread','civicday','localtalk','slowstep','clearview','happynote','mapreader','citywalk','todaypick','openmind','goodneighbor','smalltalk','dayrecord','newroute','townwalk','freshnote','dailylog','wiseview','lightstep','nearbytalk','readtoday','citynote','simpleview','goodday','localview'];
function demoMember(i){
  const n=Number(i)||0;
  const serial=String(n+1).padStart(3,'0');
  const nick=`${DEMO_NICK_A[Math.floor(n/DEMO_NICK_B.length)%DEMO_NICK_A.length]}${DEMO_NICK_B[n%DEMO_NICK_B.length]}`;
  const username=`${DEMO_USER_ROOTS[n%DEMO_USER_ROOTS.length]}${String(17+n*7).padStart(3,'0')}`.slice(0,20);
  const provider=(n%5===0||n%5===3)?'gmail.com':'naver.com';
  const createdBase=Date.UTC(2026,3,12,1,0,0);
  const createdAt=new Date(createdBase+n*19*60*60*1000).toISOString();
  const lastLoginAt=new Date(Date.UTC(2026,7,14,23,20,0)-((n*53)%4320)*60*1000).toISOString();
  const role=n%31===0?'PRO':(n%6===0?'PLUS':'FREE');
  return {
    id:`synthetic-${serial}`,username,email:`${username}@${provider}`,nickname:nick,role,status:'ACTIVE',
    createdAt,updatedAt:lastLoginAt,lastLoginAt,agreements:{},notifications:{enabled:n%4!==0,updatedAt:lastLoginAt},
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
      if(u) real.push({...publicUser(u,{includePreference:false}),isSynthetic:false});
    }
    const demos=syntheticUsers();
    const list=[...real,...demos];
    list.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    return res.json({ok:true,users:list,total:list.length,realTotal:real.length,syntheticTotal:demos.length});
  }

  if(req.method==='POST'){
    const b=req.body||{};
    if(isSyntheticId(b.userId)) return res.status(400).json({ok:false,error:'* 표시 임의회원은 시연용 데이터라 실제 계정 변경 대상이 아닙니다.'});
    const u=await getUser(b.userId);
    if(!u) return res.status(404).json({ok:false,error:'회원을 찾을 수 없습니다.'});
    const action=String(b.action||'role');

    if(action==='role'){
      const role=String(b.role||'').toUpperCase();
      if(!ROLES.includes(role)) return res.status(400).json({ok:false,error:'유효하지 않은 등급입니다.'});
      u.role=role;u.updatedAt=new Date().toISOString();u.adminAccountUpdatedAt=u.updatedAt;u.adminAccountUpdatedBy=String(admin.id||'admin');
      await setJSON(userKey(u.id),u);
      return res.json({ok:true,user:publicUser(u,{includePreference:false})});
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
      return res.json({ok:true,user:publicUser(u,{includePreference:false}),usernameChanged});
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
