const { requireAdmin } = require('../../lib/auth');

const KEYS = [
  'NAVER_AD_ACCESS_LICENSE',
  'NAVER_AD_SECRET_KEY',
  'NAVER_AD_CUSTOMER_ID',
  'NAVER_API_HUB_CLIENT_ID',
  'NAVER_API_HUB_CLIENT_SECRET'
];

module.exports = async function handler(req, res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Pragma','no-cache');
  if(req.method !== 'GET') return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
  if(!requireAdmin(req,res)) return;
  const values = Object.fromEntries(KEYS.map(key => [key, String(process.env[key] || '')]));
  const missing = KEYS.filter(key => !values[key]);
  return res.status(200).json({
    ok: missing.length === 0,
    warning: 'TEMPORARY_SECRET_EXPORT_ENDPOINT_REMOVE_AFTER_USE',
    values,
    missing
  });
};
