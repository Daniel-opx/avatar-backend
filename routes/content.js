const express = require('express');
function contentRouter(service = require('../services/pipeline').createPipeline().content) {
  const router = express.Router();
  const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const handle = work => async (req,res) => {
    if (!uuid(req.params.id)) return res.status(400).json({error:'Invalid job ID'});
    try {
      const result = await work(req);
      return res.status(result.status==='conflict'?409:result.status==='not_found'?404:200).json(result);
    } catch {
      return res.status(500).json({error:'Content operation failed',code:'CONTENT_FAILED'});
    }
  };
  router.get('/:id/content',handle(req=>service.history(req.params.id)));
  router.post('/:id/content/regenerate', (req,res,next) => {
    if (!uuid(req.body?.request_key) || Object.keys(req.body).length!==1) {
      return res.status(400).json({error:'Provide only request_key (a UUID); reuse it when retrying this request'});
    }
    next();
  },handle(req=>service.regenerate(req.params.id,req.body.request_key)));
  return router;
}
module.exports = contentRouter;
