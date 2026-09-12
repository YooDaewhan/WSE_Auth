import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import config from './config.js';
import { assertConnection } from './db.js';
import health from './routes/health.js';
import auth from './routes/auth.js';
import errorHandler from './middleware/errorHandler.js';
import { purgeExpired } from './services/token.js';

const app = express();
app.set('trust proxy', 1); // nginx 뒤

app.use(helmet());
app.use(cors({ origin: config.allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/health', health);
app.use('/auth', auth);

app.use('/*splat', (req, res) => res.status(404).json({ error: 'not_found' })); // Express 5 문법
app.use(errorHandler);

try {
  await assertConnection();
} catch (err) {
  console.error('DB connection failed:', err.message);
  process.exit(1);
}

setInterval(() => purgeExpired().catch((e) => console.error('purge failed:', e.message)), 6 * 3600_000).unref();

app.listen(config.port, '127.0.0.1', (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`auth server listening on 127.0.0.1:${config.port} (${config.env})`);
});
