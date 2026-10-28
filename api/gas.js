// Vercel Serverless Function：
// 1) 前端只呼叫 /api/gas，Token 與 GAS 網址只存在伺服器端環境變數
// 2) 報名需通過 Cloudflare Turnstile 人機驗證
// 3) 管理動作需帶 Google 登入的 ID Token，驗證後才把 email 交給後端比對白名單
import { OAuth2Client } from 'google-auth-library';

const PUBLIC_ACTIONS = new Set([
  'getInitialData', 'getRegistrationStatusAndTimes', 'processRegistration', 'processResubmission', 'queryRegistration'
]);
const ADMIN_ACTIONS = new Set([
  'adminLogin', 'saveAdminData', 'getPriorityCandidates', 'updateCandidateStatus', 'getLotteryGrades',
  'getLotteryParticipants', 'getLotteryResult', 'performLottery', 'saveLotteryImageToDrive', 'clearAllData'
]);
const NEEDS_TURNSTILE = new Set(['processRegistration']);

export const config = { maxDuration: 60 };

const oauth = new OAuth2Client();

function getIp(req) {
  const raw = req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || '';
  return String(raw).trim().slice(0, 64);
}

async function verifyTurnstile(token, ip) {
  if (!token || !process.env.TURNSTILE_SECRET_KEY) return false;
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: String(token), remoteip: ip });
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const j = await r.json();
  return !!j.success;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const { action, data, idToken, turnstileToken } = req.body || {};
  const isAdmin = ADMIN_ACTIONS.has(action);
  if (!isAdmin && !PUBLIC_ACTIONS.has(action)) return res.status(400).json({ success: false, message: '未知的請求動作' });
  if (!process.env.GAS_API_URL || !process.env.API_SECRET_TOKEN) return res.status(500).json({ success: false, message: '系統設定不完整，請聯絡承辦人。' });

  const ip = getIp(req);
  let admin = null;

  if (isAdmin) {
    try {
      const ticket = await oauth.verifyIdToken({ idToken: String(idToken || ''), audience: process.env.GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      if (!p || !p.email || !p.email_verified) throw new Error('unverified');
      admin = { email: String(p.email).toLowerCase() };
    } catch (e) {
      return res.status(401).json({ success: false, message: '登入已過期或尚未登入，請重新使用 Google 帳號登入。' });
    }
  }

  if (NEEDS_TURNSTILE.has(action)) {
    if (!process.env.TURNSTILE_SECRET_KEY) return res.status(500).json({ success: false, message: '系統尚未設定人機驗證，請聯絡承辦人。' });
    let ok = false;
    try { ok = await verifyTurnstile(turnstileToken, ip); } catch (e) { ok = false; }
    if (!ok) return res.status(403).json({ success: false, message: '人機驗證失敗或已過期，請重新勾選驗證後再送出。' });
  }

  try {
    const r = await fetch(process.env.GAS_API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: process.env.API_SECRET_TOKEN, action, data: data || {}, admin, clientIp: ip })
    });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(502).json({ success: false, message: '後端暫時無法連線，請稍後再試。' });
  }
}
