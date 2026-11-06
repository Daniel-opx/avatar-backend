const crypto = require("node:crypto");

function authorize(req, res, next, keys) {
  const configured = keys.filter(key => typeof key === 'string' && key.length > 0);
  if (configured.length === 0) {
    console.error("API authentication is not configured");
    return res.status(503).json({ error: "API authentication is not configured" });
  }

  const providedKey = req.get("x-api-key");
  if (typeof providedKey !== "string") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const providedHash = crypto.createHash("sha256").update(providedKey).digest();
  const matched = configured.map(key => crypto.timingSafeEqual(
    crypto.createHash('sha256').update(key).digest(), providedHash
  )).some(Boolean);
  if (!matched) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

function apiKeyAuth(req, res, next) {
  return authorize(req, res, next, [process.env.API_KEY]);
}

// A dedicated external trigger key grants only this POST operation.
// Existing owner/API clients retain their current access with API_KEY.
apiKeyAuth.scheduler = function schedulerAuth(req, res, next) {
  const allowed = req.method === 'POST' && ['/run-scheduler', '/run-scheduler/'].includes(req.path);
  return authorize(req, res, next, [process.env.API_KEY, ...(allowed ? [process.env.SCHEDULER_API_KEY] : [])]);
};

module.exports = apiKeyAuth;
