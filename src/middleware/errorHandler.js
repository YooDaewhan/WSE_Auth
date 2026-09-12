export const httpError = (status, message) => Object.assign(new Error(message), { status, expose: status < 500 });

// Express 5: async 핸들러의 rejected promise가 여기로 들어온다
export default function errorHandler(err, req, res, _next) {
  const status = err.status ?? 500;
  if (status >= 500) console.error(`${req.method} ${req.originalUrl}`, err);
  res.status(status).json({ error: err.expose ? err.message : 'internal_error' });
}
