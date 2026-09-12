import mysql from 'mysql2/promise';
import config from './config.js';

// max_connections=30 인 서버라 풀은 낮게 잡는다
const pool = mysql.createPool({ ...config.db, waitForConnections: true, connectionLimit: 8 });

export async function assertConnection() {
  const conn = await pool.getConnection();
  try { await conn.ping(); } finally { conn.release(); }
}

export default pool;
