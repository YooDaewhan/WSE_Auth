import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config.js';
import google from '../providers/google.js';
import kakao from '../providers/kakao.js';
import { findOrCreate, findByUid } from '../services/user.js';
import { signAccess, issueRefresh, consumeRefresh, revokeRefresh } from '../services/token.js';
import requireAuth from '../middleware/requireAuth.js';
import { httpError } from '../middleware/errorHandler.js';

const providers = { google, kakao };
const router = Router();

const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

const cookieBase = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'lax',
  domain: config.cookieDomain,
  path: '/',
};

async function setAuthCookies(req, res, user) {
  // access 토큰은 세션 쿠키. 실제 만료는 JWT exp 가 결정한다.
  res.cookie('access_token', signAccess(user), cookieBase);
  const refresh = await issueRefresh(user.id, req.get('user-agent'));
  res.cookie('refresh_token', refresh, { ...cookieBase, maxAge: config.jwt.refreshDays * 86_400_000 });
}

function clearAuthCookies(res) {
  res.clearCookie('access_token', cookieBase);
  res.clearCookie('refresh_token', cookieBase);
}

async function postForm(url, params, label) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!r.ok) throw httpError(502, `${label} failed: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// --- 고정 경로를 /:provider 보다 먼저 둘 것 ---

router.get('/public-key', (req, res) => res.type('text/plain').send(config.jwt.publicKey));

router.get('/me', requireAuth, async (req, res) => {
  const user = await findByUid(req.user.sub);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({
    uid: user.uid,
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    providers: user.providers?.split(',') ?? [],
  });
});

router.post('/refresh', limiter, async (req, res) => {
  const token = req.body?.refresh_token ?? req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: 'no_refresh_token' });
  const row = await consumeRefresh(token);
  if (!row) {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'invalid_refresh_token' });
  }
  await setAuthCookies(req, res, { id: row.user_id, uid: row.uid, nickname: row.nickname });
  res.json({ ok: true });
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (token) await revokeRefresh(token);
  clearAuthCookies(res);
  res.json({ ok: true });
});

// --- OAuth (google | kakao 공통 흐름) ---

const pick = (req) => {
  const p = providers[req.params.provider];
  if (!p) throw httpError(404, 'unknown_provider');
  return p;
};

router.get('/:provider', limiter, (req, res) => {
  const p = pick(req);
  const state = randomBytes(16).toString('hex');
  res.cookie('oauth_state', `${p.name}:${state}`, {
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'lax',
    maxAge: 600_000,
    path: '/auth',
  });
  const url = new URL(p.authUrl);
  url.search = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: p.scope,
    state,
    ...p.extraAuthParams,
  }).toString();
  res.redirect(302, url.toString());
});

router.get('/:provider/callback', limiter, async (req, res) => {
  const p = pick(req);
  const { code, state } = req.query;
  const expected = req.cookies?.oauth_state;
  res.clearCookie('oauth_state', { path: '/auth' });

  if (!code || !state || expected !== `${p.name}:${state}`) throw httpError(400, 'invalid_state');

  const tokens = await postForm(p.tokenUrl, {
    grant_type: 'authorization_code',
    code,
    client_id: p.clientId,
    client_secret: p.clientSecret,
    redirect_uri: p.redirectUri,
  }, `${p.name} token exchange`);

  const r = await fetch(p.profileUrl, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!r.ok) throw httpError(502, `${p.name} profile fetch failed: ${(await r.text()).slice(0, 300)}`);

  const user = await findOrCreate({ provider: p.name, ...p.normalize(await r.json()) });
  await setAuthCookies(req, res, user);
  res.redirect(302, config.postLoginRedirect);
});

export default router;
