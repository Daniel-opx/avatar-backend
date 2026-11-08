const express = require('express');

function processingRouter(service = require('../services/pipeline').createPipeline().processing) {
  const router = express.Router();
  const validId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  function handle(work) {
    return async (req, res) => {
      if (req.params.id && !validId(req.params.id)) return res.status(400).json({ error: 'Invalid job ID' });
      try {
        const result = await work(req);
        res.status(result.status === 'conflict' ? 409 : result.status === 'not_found' ? 404 : 200).json(result);
      } catch (error) {
        console.error(JSON.stringify({ event: 'processing_failed', code: error.code || 'UNKNOWN' }));
        res.status(500).json({ error: 'Processing operation failed', code: 'PROCESSING_FAILED' });
      }
    };
  }
  router.post('/run', handle(() => service.runOne()));
  router.get('/:id/history', handle(req => service.history(req.params.id)));
  router.post('/:id/retry', handle(req => service.control(req.params.id, 'retry')));
  router.post('/:id/cancel', handle(req => service.control(req.params.id, 'cancel')));
  return router;
}
module.exports = processingRouter;
