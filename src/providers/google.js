import config from '../config.js';

export default {
  name: 'google',
  ...config.providers.google,
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  profileUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
  scope: 'openid email profile',
  extraAuthParams: { access_type: 'online', prompt: 'select_account' },
  normalize: (p) => ({
    providerUid: String(p.sub),
    email: p.email ?? null,
    nickname: p.name ?? null,
    avatarUrl: p.picture ?? null,
  }),
};
