// node test.js — DB/네트워크 없이 도는 것만 검사한다.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

if (!existsSync('keys/private.pem')) {
  mkdirSync('keys', { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  writeFileSync('keys/private.pem', privateKey);
  writeFileSync('keys/public.pem', publicKey);
}

// dotenv 는 이미 설정된 값을 덮지 않으므로 여기서 먼저 채운다
Object.assign(process.env, {
  DB_USER: 'x', DB_PASSWORD: 'x', BASE_URL: 'https://auth.example',
  GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', GOOGLE_REDIRECT_URI: 'https://auth.example/auth/google/callback',
  KAKAO_CLIENT_ID: 'x', KAKAO_CLIENT_SECRET: 'x', KAKAO_REDIRECT_URI: 'https://auth.example/auth/kakao/callback',
});

const { default: google } = await import('./src/providers/google.js');
const { default: kakao } = await import('./src/providers/kakao.js');
const { signAccess, verifyAccess } = await import('./src/services/token.js');

assert.deepEqual(
  google.normalize({ sub: '1234', email: 'a@b.c', name: '길동', picture: 'https://p/1.png' }),
  { providerUid: '1234', email: 'a@b.c', nickname: '길동', avatarUrl: 'https://p/1.png' },
);

// 카카오: id 는 숫자로 오고, 이메일 동의를 안 하면 통째로 없다
assert.deepEqual(
  kakao.normalize({ id: 9007199254740991, kakao_account: { profile: { nickname: '길동', profile_image_url: 'https://p/2.png' } } }),
  { providerUid: '9007199254740991', email: null, nickname: '길동', avatarUrl: 'https://p/2.png' },
);
assert.deepEqual(kakao.normalize({ id: 7 }), { providerUid: '7', email: null, nickname: null, avatarUrl: null });

const token = signAccess({ uid: 'uid-1', nickname: '길동' });
const payload = verifyAccess(token);
assert.equal(payload.sub, 'uid-1');
assert.equal(payload.nickname, '길동');
assert.ok(payload.exp - payload.iat === 900, 'access ttl 15m');
assert.equal(payload.email, undefined, 'JWT 에 이메일을 넣지 않는다');

// 페이로드를 갈아끼우면 서명 검증에서 걸려야 한다
const [head, , sig] = token.split('.');
const forged = `${head}.${Buffer.from(JSON.stringify({ sub: 'attacker', nickname: '해커' })).toString('base64url')}.${sig}`;
assert.throws(() => verifyAccess(forged), /signature/i);

console.log('ok');
process.exit(0);
