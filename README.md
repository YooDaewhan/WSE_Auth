# auth.wsestudio.net

구글·카카오 소셜 로그인 + RS256 JWT 발급 서버. Node 24 / Express 5 / MySQL 8.

로컬(이 저장소) → git push → 서버에서 pull. 서버 명령은 전부 root 로 실행.

## Phase 0 — 터미널 밖 (먼저 끝낼 것)

- [ ] DNS: `auth` A 레코드 → `49.247.136.17`. 확인: `getent hosts auth.wsestudio.net`
      **이게 안 잡히면 Phase 2 의 certbot 이 실패한다.**
- [ ] Google Cloud Console: OAuth 클라이언트 ID(웹), 승인된 리디렉션 URI
      `https://auth.wsestudio.net/auth/google/callback`, 테스트 사용자에 본인 계정 추가
- [ ] Kakao Developers: 카카오 로그인 ON, Redirect URI 동일 경로,
      동의항목 닉네임(필수)/프로필사진/이메일(선택), 보안 탭에서 Client Secret 발급 후 **사용함**

## Phase 1 — 서버 환경 (RAM 1GB)

```bash
# 1-A. swap 2GB — MySQL 설치 중 OOM 방지
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
printf 'vm.swappiness=10\nvm.vfs_cache_pressure=50\n' > /etc/sysctl.d/99-swap.conf
sysctl --system && free -h

# 1-B. MySQL 8
apt update && apt install -y mysql-server && systemctl enable --now mysql

# 1-C. 메모리 튜닝 (performance_schema OFF 만으로 ~200MB 절약)
cat > /etc/mysql/mysql.conf.d/zz-auth.cnf <<'CNF'
[mysqld]
bind-address                 = 127.0.0.1
performance_schema           = OFF
innodb_buffer_pool_size      = 128M
innodb_buffer_pool_instances = 1
innodb_log_file_size         = 48M
max_connections              = 30
table_open_cache             = 200
tmp_table_size               = 16M
max_heap_table_size          = 16M
key_buffer_size              = 8M
CNF
systemctl restart mysql && systemctl status mysql --no-pager

# 1-D. 보안
mysql_secure_installation
ufw status            # 3306 이 열려 있지 않을 것

# 1-F. Node 24 LTS
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs && node -v && npm -v
```

확인: `free -h` 에 swap 2.0Gi, `node -v` 가 v24.x, `ss -lntp | grep 3306` 이 127.0.0.1 만.

## Phase 1-E / 3 — DB 와 스키마

```bash
openssl rand -base64 24        # auth_app 비밀번호. 출력을 .env 에 넣는다
mysql -u root -p < /srv/auth/schema.sql
mysql -u root -p -e "
CREATE USER IF NOT EXISTS 'auth_app'@'127.0.0.1' IDENTIFIED BY '<위에서_만든_비밀번호>';
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.* TO 'auth_app'@'127.0.0.1';
FLUSH PRIVILEGES;"
```

확인: `mysql -u auth_app -p -h 127.0.0.1 auth -e 'SHOW TABLES;'` → 3개.
`DROP TABLE users;` 는 거부되어야 정상.

## Phase 2 / 8 — 배포

```bash
adduser --system --group --home /srv/auth --no-create-home auth
cd /srv/auth && git clone <이_저장소> . && npm ci --omit=dev

# 실서버 키는 서버에서 새로 만든다 (개발용 키 재사용 금지)
mkdir -p keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/private.pem
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

cp .env.example .env && vi .env        # DB_PASSWORD, 구글/카카오 키 채우기
chmod 600 .env keys/private.pem
chown -R auth:auth /srv/auth

install -m644 deploy/auth.service /etc/systemd/system/auth.service
systemctl daemon-reload && systemctl enable --now auth
journalctl -u auth -f                  # "listening on 127.0.0.1:3000"

install -m644 deploy/nginx-auth.conf /etc/nginx/sites-available/auth.wsestudio.net
ln -sf /etc/nginx/sites-available/auth.wsestudio.net /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d auth.wsestudio.net  # DNS A 레코드가 먼저 잡혀 있어야 함
```

확인:
```bash
curl -s https://auth.wsestudio.net/health           # {"ok":true,...}
curl -s https://auth.wsestudio.net/auth/public-key  # PUBLIC KEY PEM
curl -sI https://auth.wsestudio.net/auth/google | grep -i location   # accounts.google.com
```
브라우저에서 `https://auth.wsestudio.net/auth/google` → 로그인 → 프론트로 리다이렉트.
`mysql -u auth_app -p auth -e 'SELECT uid,nickname FROM users;'` 에 행이 생기면 성공.

## 다른 서비스에서 토큰 검증

```js
import jwt from 'jsonwebtoken';
const pub = await fetch('https://auth.wsestudio.net/auth/public-key').then(r => r.text()); // 캐시할 것
const { sub } = jwt.verify(req.cookies.access_token, pub, { algorithms: ['RS256'] });      // sub === uid
```

## 로컬 개발

```bash
npm test            # DB 없이 도는 자체 점검
npm run dev
```
