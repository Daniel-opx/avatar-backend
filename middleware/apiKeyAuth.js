const crypto = require("node:crypto");

function apiKeyAuth(req, res, next) {
  const expectedKey = process.env.API_KEY;
  if (!expectedKey) {
    console.error("API_KEY is not configured");
    return res.status(503).json({ error: "API authentication is not configured" });
  }

  const providedKey = req.get("x-api-key");
  if (typeof providedKey !== "string") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const expectedHash = crypto.createHash("sha256").update(expectedKey).digest();
  const providedHash = crypto.createHash("sha256").update(providedKey).digest();
  if (!crypto.timingSafeEqual(expectedHash, providedHash)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

module.exports = apiKeyAuth;
