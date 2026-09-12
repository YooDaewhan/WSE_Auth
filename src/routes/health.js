import { Router } from 'express';
import pool from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

export default router;
