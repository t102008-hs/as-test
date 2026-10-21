// Vercel Serverless Function：前端只呼叫 /api/gas，Token 與 GAS 網址只存在伺服器端環境變數。
const ALLOWED = new Set([
  'getInitialData', 'getRegistrationStatusAndTimes', 'processRegistration', 'processResubmission',
  'queryRegistration', 'adminLogin', 'saveAdminData', 'getPriorityCandidates', 'updateCandidateStatus',
  'getLotteryGrades', 'getLotteryParticipants', 'getLotteryResult', 'performLottery',
  'saveLotteryImageToDrive', 'clearAllData'
]);

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const { action, data } = req.body || {};
  if (!ALLOWED.has(action)) return res.status(400).json({ success: false, message: '未知的請求動作' });
  try {
    const r = await fetch(process.env.GAS_API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: process.env.API_SECRET_TOKEN, action, data: data || {} })
    });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(502).json({ success: false, message: '後端暫時無法連線，請稍後再試。' });
  }
}
