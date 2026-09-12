import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import config from '../config.js';

const hash = (token) => createHash('sha256').update(token).digest('hex');

export const signAccess = (user) =>
  jwt.sign({ sub: user.uid, nickname: user.nickname ?? null }, config.jwt.privateKey, {
    algorithm: 'RS256',
    expiresIn: config.jwt.accessTtl,
  });

export const verifyAccess = (token) =>
  jwt.verify(token, config.jwt.publicKey, { algorithms: ['RS256'] });

export async function issueRefresh(userId, userAgent) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.jwt.refreshDays * 86_400_000);
  await pool.execute(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent) VALUES (?, ?, ?, ?)',
    [userId, hash(token), expiresAt, (userAgent ?? '').slice(0, 255)],
  );
  return token;
}

// 검증 + 즉시 폐기. rotation 이므로 한 번 쓰면 끝.
export async function consumeRefresh(token) {
  const [rows] = await pool.execute(
    `SELECT rt.id, rt.user_id, u.uid, u.nickname
     FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = ? AND rt.revoked_at IS NULL AND rt.expires_at > NOW() AND u.status = 'active'`,
    [hash(token)],
  );
  if (!rows.length) return null;
  await pool.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [rows[0].id]);
  return rows[0];
}

export const revokeRefresh = (token) =>
  pool.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL', [hash(token)]);

export const purgeExpired = () =>
  pool.execute('DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL 7 DAY');
