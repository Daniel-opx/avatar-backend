const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { randomUUID } = require('node:crypto');
const internalRouter = require('./routes/internal');
const apiKeyAuth = require('./middleware/apiKeyAuth');

function createApp({ pool = require('./db/pool'), logger = console.log, rateLimitMax = 120, render = Boolean(process.env.RENDER), completion, team, approvals, dashboard, publishing, pipeline, jobs } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', render ? 1 : false);
  app.use(helmet({contentSecurityPolicy:{directives:{'upgrade-insecure-requests':render||process.env.NODE_ENV==='production'?[]:null}}}));
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
  const video = require('./routes/video');
  const callbacks = require('./routes/webhooks');
  pipeline ||= require('./services/pipeline').createPipeline(pool);
  completion ||= pipeline.completion;
  jobs ||= require('./routes/jobs').createJobsRouter(pool);
  team ||= require('./services/team').createTeamService(pool);
  approvals ||= require('./services/approvals').createApprovalService(pool,team);
  const auth = require('./middleware/teamAuth').createTeamAuth(team,{secure:render||process.env.NODE_ENV==='production'});
  const teamRoutes = require('./routes/team');
  dashboard ||= require('./services/dashboard').createDashboardService(pool,team);
  publishing ||= require('./services/publishing').createPublishingService(pool,team);
  app.use('/auth',json,teamRoutes.authRouter(team,auth));
  app.use('/team',json,require('./routes/dashboard')(auth,dashboard,publishing));
  app.use('/team',json,teamRoutes.teamRouter(team,auth,approvals,pipeline.processing));
  app.use('/webhooks', callbacks.webhookRouter(completion));
  app.use('/review', callbacks.reviewRouter(completion));
  app.use('/jobs', auth.jobs, json, jobs, require('./routes/content')(pipeline.content), require('./routes/assets')(pipeline.assets), require('./routes/rendering')(pipeline.rendering), video.videoRouter(completion),require('./routes/approvals')(approvals,auth));
  app.use('/internal/videos', apiKeyAuth, json, video.reconcileRouter(completion));
  app.use('/internal/processing', apiKeyAuth, json, require('./routes/processing')(pipeline.processing));
  app.use('/internal', apiKeyAuth.scheduler, json, internalRouter);
  app.get('/',(req,res)=>res.redirect('/dashboard'));
  app.use('/dashboard',express.static(require('node:path').join(__dirname,'public/dashboard'),{index:'index.html',maxAge:0}));
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ error: status === 413 ? 'Request body too large' : status === 400 ? 'Invalid JSON body' : 'Internal server error' });
  });
  return app;
}
module.exports = { createApp };
