const express = require("express");
const pool = require("../db/pool");
const router = express.Router();

router.post("/", async (req, res) => {
  const topic = req.body?.topic;
  if (typeof topic !== "string" || !topic.trim() || topic.length > 500) {
    return res.status(400).json({ error: "topic must be a nonempty string up to 500 characters" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO jobs (topic) VALUES ($1) RETURNING *",
      [topic.trim()]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(JSON.stringify({ event: 'job_create_failed', code: error.code || 'UNKNOWN' }));
    return res.status(500).json({ error: "Could not create job" });
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100"
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(JSON.stringify({ event: 'job_list_failed', code: error.code || 'UNKNOWN' }));
    return res.status(500).json({ error: "Could not load jobs" });
  }
});

module.exports = router;
