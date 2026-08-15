const {requireAdmin}=require('../../lib/auth');
const {cmd,getJSON,setJSON}=require('../../lib/store');
const {
  ROLES,userKey,publicUser,normalizeUsername,validateUsername,validatePassword,
  usernameIndexKey,hashPassword
}=require('../../lib/user_auth');

async function getUser(id){ return id ? getJSON(userKey(id)) : null; }

module.exports=async function(req,res){
  const admin=requireAdmin(req,res);
  if(!admin) return;

  if(req.method==='GET'){
    const ids=await cmd(['SMEMBERS','jjdd:users']);
    const list=[];
    for(const id of (ids||[]).slice(0,1000)){
      const u=await getUser(id);
      if(u) list.push(publicUser(u,{includePreference:false}));
    }
    list.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    return res.json({ok:true,users:list,total:list.length});
  }

  if(req.method==='POST'){
    const b=req.body||{};
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
