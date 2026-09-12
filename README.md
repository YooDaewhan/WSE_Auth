# auth.wsestudio.net

구글·카카오 소셜 로그인 + RS256 JWT 발급 서버. Node 24 / Express 5 / MySQL 8.

## 서버 현황 (2026-09-12 기준, 49.247.136.17)

| 항목 | 상태 |
|---|---|
| swap 2GB, `vm.swappiness=10` | 완료 |
| MySQL 8.0.46 — `bind-address=127.0.0.1`, `performance_schema=OFF`, buffer pool 128M, `max_connections=30` | 완료 |
| Node v24.21.0 | 완료 |
| DNS `auth` A 레코드, Let's Encrypt 인증서 | 완료 (만료 2026-12-11) |
| DB `auth` + 테이블 3개, `auth_app`(DML만) / `auth_admin`(DDL) | 완료 |
| `/srv/auth` 코드, `keys/*.pem`, systemd `auth.service`, nginx 리버스 프록시 | 완료 |
| **`.env` 비밀값 5개** | **미입력 — 아래 참조** |

## 남은 것 — .env 채우고 기동

```bash
ssh root@49.247.136.17
nano /srv/auth/.env     # DB_PASSWORD, GOOGLE_CLIENT_ID/SECRET, KAKAO_CLIENT_ID/SECRET
chown auth:auth /srv/auth/.env && chmod 600 /srv/auth/.env
systemctl enable --now auth && journalctl -u auth -f
```

`auth_app` 비밀번호를 잊었으면 재설정(root 는 auth_socket 이라 비밀번호 없이 접속됨):

```bash
openssl rand -base64 24
mysql -e "ALTER USER 'auth_app'@'127.0.0.1' IDENTIFIED BY '<위_출력값>';"
```

확인:
```bash
curl -s https://auth.wsestudio.net/health              # {"ok":true,...}
curl -s https://auth.wsestudio.net/auth/public-key     # PUBLIC KEY PEM
curl -sI https://auth.wsestudio.net/auth/google | grep -i location   # accounts.google.com
```
브라우저로 `https://auth.wsestudio.net/auth/google` → 로그인 → `https://wsestudio.net` 로 리다이렉트.
`mysql -e "SELECT uid,nickname FROM auth.users"` 에 행이 생기면 성공.

## Phase 0 — 콘솔 설정 (아직이면)

- Google Cloud Console: OAuth 클라이언트 ID(웹), 승인된 리디렉션 URI
  `https://auth.wsestudio.net/auth/google/callback`, 테스트 사용자에 본인 계정 추가
- Kakao Developers: 카카오 로그인 ON, Redirect URI 동일 경로,
  동의항목 닉네임(필수)/프로필사진/이메일(선택), 보안 탭에서 Client Secret 발급 후 **사용함**

## 코드 갱신 배포

```bash
tar --exclude=./node_modules --exclude=./.git --exclude='./keys/*.pem' -czf - . \
  | ssh root@49.247.136.17 'tar -xzf - -C /srv/auth && cd /srv/auth && npm ci --omit=dev && chown -R auth:auth . && systemctl restart auth'
```
`.env` 와 `keys/` 는 tar 에서 빠지므로 덮어써지지 않습니다.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 상태 확인 (DB ping 포함) |
| GET | `/auth/google`, `/auth/kakao` | 로그인 시작 (state 쿠키 발급 후 리다이렉트) |
| GET | `/auth/{provider}/callback` | 콜백. 계정 조회·생성 → 쿠키 발급 → 프론트로 |
| GET | `/auth/me` | 현재 사용자 (`uid`, `nickname`, `avatarUrl`, `providers`) |
| POST | `/auth/refresh` | 리프레시 토큰 회전 후 새 토큰 쌍 |
| POST | `/auth/logout` | 리프레시 토큰 폐기 + 쿠키 삭제 |
| GET | `/auth/public-key` | 다른 서비스용 검증 공개키 |

쿠키: `access_token`(세션 쿠키, JWT exp 15분), `refresh_token`(30일) — 둘 다
`domain=.wsestudio.net`, `httpOnly`, `secure`, `sameSite=lax`.

## 다른 서비스에서 토큰 검증

```js
import jwt from 'jsonwebtoken';
const pub = await fetch('https://auth.wsestudio.net/auth/public-key').then(r => r.text()); // 캐시할 것
const { sub } = jwt.verify(req.cookies.access_token, pub, { algorithms: ['RS256'] });      // sub === uid
```

## 로컬 개발

```bash
npm test        # DB 없이 도는 자체 점검 (provider normalize, JWT 서명/검증)
npm run dev
```
