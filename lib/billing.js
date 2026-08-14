const crypto=require('crypto');
const {setJSON,lpush,ltrim}=require('./store');

const PLANS={
  PLUS_MONTHLY:{
    code:'PLUS_MONTHLY',
    role:'PLUS',
    name:'정참시 PLUS',
    amount:5000,
    currency:'KRW',
    interval:'MONTHLY',
    provider:'CMS'
  }
};

async function createCheckoutIntent(user,planCode='PLUS_MONTHLY'){
  const plan=PLANS[planCode];
  if(!plan) throw new Error('지원하지 않는 요금제입니다.');
  const id=crypto.randomUUID();
  const intent={
    id,userId:user.id,
    planCode:plan.code,amount:plan.amount,currency:plan.currency,interval:plan.interval,
    provider:plan.provider,status:'PENDING_PROVIDER',createdAt:new Date().toISOString()
  };
  await setJSON(`jjdd:billing:intent:${id}`,intent,60*60*24*30);
  await lpush('jjdd:billing:intents',JSON.stringify(intent));
  await ltrim('jjdd:billing:intents',0,499);
  return intent;
}
module.exports={PLANS,createCheckoutIntent};
