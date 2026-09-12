import { randomUUID } from 'node:crypto';
import pool from '../db.js';

const SELECT_BY_IDENTITY = `
  SELECT u.id, u.uid, u.nickname, u.avatar_url, u.status
  FROM identities i JOIN users u ON u.id = i.user_id
  WHERE i.provider = ? AND i.provider_uid = ?`;

export async function findOrCreate({ provider, providerUid, email, nickname, avatarUrl }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [found] = await conn.execute(SELECT_BY_IDENTITY, [provider, providerUid]);
    if (found.length) {
      await conn.commit();
      return found[0];
    }
    const uid = randomUUID();
    const [ins] = await conn.execute(
      'INSERT INTO users (uid, nickname, avatar_url) VALUES (?, ?, ?)',
      [uid, nickname ?? null, avatarUrl ?? null],
    );
    await conn.execute(
      'INSERT INTO identities (user_id, provider, provider_uid, email) VALUES (?, ?, ?, ?)',
      [ins.insertId, provider, providerUid, email ?? null],
    );
    await conn.commit();
    return { id: ins.insertId, uid, nickname: nickname ?? null, avatar_url: avatarUrl ?? null, status: 'active' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function findByUid(uid) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.uid, u.nickname, u.avatar_url,
            (SELECT GROUP_CONCAT(provider) FROM identities WHERE user_id = u.id) AS providers
     FROM users u WHERE u.uid = ? AND u.status = 'active'`,
    [uid],
  );
  return rows[0] ?? null;
}
