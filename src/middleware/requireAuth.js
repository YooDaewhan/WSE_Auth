import { verifyAccess } from '../services/token.js';

export default function requireAuth(req, res, next) {
  const bearer = (req.get('authorization') ?? '').match(/^Bearer (.+)$/)?.[1];
  const token = req.cookies?.access_token ?? bearer;
  if (!token) return res.status(401).json({ error: 'unauthenticated' });
  try {
    req.user = verifyAccess(token);
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}
