import config from '../config.js';

export default {
  name: 'kakao',
  ...config.providers.kakao,
  authUrl: 'https://kauth.kakao.com/oauth/authorize',
  tokenUrl: 'https://kauth.kakao.com/oauth/token',
  profileUrl: 'https://kapi.kakao.com/v2/user/me',
  scope: 'profile_nickname,profile_image,account_email',
  extraAuthParams: {},
  // 카카오는 이메일을 안 줄 수 있다. 고유키는 언제나 id.
  normalize: (p) => {
    const account = p.kakao_account ?? {};
    const profile = account.profile ?? {};
    return {
      providerUid: String(p.id),
      email: account.email ?? null,
      nickname: profile.nickname ?? null,
      avatarUrl: profile.profile_image_url ?? null,
    };
  },
};
