const {authenticate,requireUser}=require('../lib/user_auth');
const {requireAdmin}=require('../lib/auth');
const {allCatalog,getConfig,saveConfig,getProfile,recordPageView,recordActivity,setRepresentative,clearRepresentative,getRepresentativeBadge,follow,followState,manualAward,revokeBadge,getSeasonConfig,saveSeasonConfig}=require('../lib/badges');

module.exports=async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  const action=String(req.query?.action||req.body?.action||'my');
  try{
    if(req.method==='GET'){
      if(action==='catalog'){const catalog=allCatalog().filter(x=>!x.secret);return res.json({ok:true,catalog,season:await getSeasonConfig()});}
      if(action==='public'){
        const target=String(req.query?.userId||'');if(!target)return res.status(400).json({ok:false,error:'회원 ID가 없습니다.'});
        const me=await authenticate(req).catch(()=>null);const [representative,relation]=await Promise.all([getRepresentativeBadge(target),followState(me?.id,target)]);return res.json({ok:true,userId:target,representative,...relation,canFollow:Boolean(me&&String(me.id)!==target)});
      }
      if(action==='admin-overview'){
        const admin=requireAdmin(req,res);if(!admin)return;return res.json({ok:true,catalog:allCatalog(),config:await getConfig(),season:await getSeasonConfig()});
      }
      if(action==='admin-user'){
        const admin=requireAdmin(req,res);if(!admin)return;const userId=String(req.query?.userId||'');if(!userId)return res.status(400).json({ok:false,error:'회원 ID가 없습니다.'});return res.json({ok:true,profile:await getProfile(userId)});
      }
      const user=await requireUser(req,res);if(!user)return;return res.json(await getProfile(user.id));
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    const b=req.body||{};
    if(action==='page-view'){
      const user=await requireUser(req,res);if(!user)return;await recordPageView(user.id,String(b.page||''));return res.json({ok:true,profile:await getProfile(user.id)});
    }
    if(action==='compare-run'){
      const user=await requireUser(req,res);if(!user)return;await recordActivity(user.id,'compareRuns',1);return res.json({ok:true,profile:await getProfile(user.id)});
    }
    if(action==='representative'){
      const user=await requireUser(req,res);if(!user)return;const representative=b.badgeId?await setRepresentative(user.id,b.badgeId):await clearRepresentative(user.id);return res.json({ok:true,representative,profile:await getProfile(user.id)});
    }
    if(action==='follow'||action==='unfollow'){
      const user=await requireUser(req,res);if(!user)return;const target=String(b.userId||'');if(!target)return res.status(400).json({ok:false,error:'팔로우 대상이 없습니다.'});const result=await follow(user.id,target,action==='follow');return res.json({ok:true,...result});
    }
    if(action.startsWith('admin-')){
      const admin=requireAdmin(req,res);if(!admin)return;
      if(action==='admin-award')return res.json({ok:true,profile:await manualAward(String(b.userId||''),String(b.badgeId||''),b.note)});
      if(action==='admin-revoke')return res.json({ok:true,profile:await revokeBadge(String(b.userId||''),String(b.badgeId||''),b.note)});
      if(action==='admin-config')return res.json({ok:true,config:await saveConfig(b.config||{})});
      if(action==='admin-season')return res.json({ok:true,season:await saveSeasonConfig(b.season||{})});
      if(action==='admin-user')return res.json({ok:true,profile:await getProfile(String(b.userId||''))});
      return res.status(400).json({ok:false,error:'지원하지 않는 배지 관리자 작업입니다.'});
    }
    return res.status(400).json({ok:false,error:'Unknown action'});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
