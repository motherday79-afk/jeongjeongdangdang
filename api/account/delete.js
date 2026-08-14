const {requireUser,verifyPassword,usernameIndexKey,emailIndexKey,userKey,clearSessionCookie}=require('../../lib/user_auth');
const {cmd}=require('../../lib/store');
module.exports=async function(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
  const user=await requireUser(req,res); if(!user) return;
  const b=req.body||{};
  if(!(await verifyPassword(b.password,user.passwordHash))) return res.status(401).json({ok:false,error:'비밀번호가 올바르지 않습니다.'});
  const keys=[userKey(user.id),emailIndexKey(user.email)];
  if(user.username) keys.push(usernameIndexKey(user.username));
  await cmd(['DEL',...keys]);
  await cmd(['SREM','jjdd:users',user.id]).catch(()=>{});
  res.setHeader('Set-Cookie',clearSessionCookie());
  return res.json({ok:true});
};
