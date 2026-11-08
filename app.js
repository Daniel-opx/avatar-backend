const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { randomUUID } = require('node:crypto');
const jobsRouter = require('./routes/jobs');
const internalRouter = require('./routes/internal');
const apiKeyAuth = require('./middleware/apiKeyAuth');

function createApp({ pool = require('./db/pool'), logger = console.log, rateLimitMax = 120, render = Boolean(process.env.RENDER) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', render ? 1 : false);
  app.use(helmet());
  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.set('x-request-id', requestId);
    res.on('finish', () => logger(JSON.stringify({ event: 'http_request', requestId, method: req.method, status: res.statusCode })));
    next();
  });
  app.get('/health', (req, res) => res.json({ status: 'ok', message: 'Avatar backend is running' }));
  // Render ingress produced varying IP buckets even over one persistent connection.
  // Bound total work for this small service instead of trusting an unverified IP chain.
  app.use(rateLimit({ windowMs: 60000, limit: rateLimitMax,
    ...(render ? { keyGenerator: () => 'render-service' } : {}), standardHeaders: 'draft-8',
    legacyHeaders: false, message: { error: 'Too many requests; retry later' } }));
  app.get('/ready', async (req, res) => {
    try { await pool.query('SELECT 1'); res.json({ status: 'ready' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  const json = express.json({ limit: '32kb' });
  app.use('/jobs', apiKeyAuth, json, jobsRouter, require('./routes/content')());
  app.use('/internal/processing', apiKeyAuth, json, require('./routes/processing')());
  app.use('/internal', apiKeyAuth.scheduler, json, internalRouter);
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ error: status === 413 ? 'Request body too large' : status === 400 ? 'Invalid JSON body' : 'Internal server error' });
  });
  return app;
}
module.exports = { createApp };
