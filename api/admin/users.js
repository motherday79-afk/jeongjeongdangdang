const {requireAdmin}=require('../../lib/auth');
const {cmd,getJSON}=require('../../lib/store');
const {ROLES,userKey,publicUser}=require('../../lib/user_auth');
module.exports=async function(req,res){
  if(!requireAdmin(req,res)) return;
  if(req.method==='GET'){
    const ids=await cmd(['SMEMBERS','jjdd:users']);
    const list=[];
    for(const id of (ids||[]).slice(0,1000)){
      const u=await getJSON(userKey(id));
      if(u) list.push(publicUser(u,{includePreference:false}));
    }
    list.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    return res.json({ok:true,users:list,total:list.length});
  }
  if(req.method==='POST'){
    const b=req.body||{};
    const role=String(b.role||'').toUpperCase();
    if(!ROLES.includes(role)) return res.status(400).json({ok:false,error:'유효하지 않은 등급입니다.'});
    const u=await getJSON(userKey(b.userId));
    if(!u) return res.status(404).json({ok:false,error:'회원을 찾을 수 없습니다.'});
    u.role=role;u.updatedAt=new Date().toISOString();
    await require('../../lib/store').setJSON(userKey(u.id),u);
    return res.json({ok:true,user:publicUser(u,{includePreference:false})});
  }
  return res.status(405).json({ok:false,error:'Method not allowed'});
};
