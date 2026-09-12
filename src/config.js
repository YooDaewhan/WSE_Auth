import 'dotenv/config';
import { readFileSync } from 'node:fs';

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`missing required env: ${k}`); process.exit(1); }
  return v;
};

const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: need('DB_USER'),
    password: need('DB_PASSWORD'),
    database: process.env.DB_NAME ?? 'auth',
  },
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  baseUrl: need('BASE_URL'),
  jwt: {
    privateKey: readFileSync(process.env.JWT_PRIVATE_KEY_PATH ?? './keys/private.pem', 'utf8'),
    publicKey: readFileSync(process.env.JWT_PUBLIC_KEY_PATH ?? './keys/public.pem', 'utf8'),
    accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  },
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  providers: {
    google: {
      clientId: need('GOOGLE_CLIENT_ID'),
      clientSecret: need('GOOGLE_CLIENT_SECRET'),
      redirectUri: need('GOOGLE_REDIRECT_URI'),
    },
    kakao: {
      clientId: need('KAKAO_CLIENT_ID'),
      clientSecret: need('KAKAO_CLIENT_SECRET'),
      redirectUri: need('KAKAO_REDIRECT_URI'),
    },
  },
};

// 로그인 성공 후 돌려보낼 프론트 주소
config.postLoginRedirect = process.env.POST_LOGIN_REDIRECT ?? config.allowedOrigins[0] ?? config.baseUrl;

export default config;
