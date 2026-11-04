const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.post('/', async (req, res) => {
  try {
    const { topic } = req.body || {};
    if (typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ error: 'A valid topic is required' });
    }
    const result = await pool.query(
      'INSERT INTO jobs (topic) VALUES ($1) RETURNING *',
      [topic.trim()]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create job:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
