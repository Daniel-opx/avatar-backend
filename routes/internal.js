const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

// Authentication is applied in server.js to /internal.
router.post("/run-scheduler", async (req, res) => {
  let client;
  let releaseError;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Serialize scheduler invocations, including concurrent HTTP requests.
    const configResult = await client.query(
      `SELECT id, enabled, frequency, timezone, next_run_at, default_topic,
              interval_count, local_run_time
       FROM public.schedule_config
       WHERE id = 1
       FOR UPDATE`
    );

    if (configResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ status: "unconfigured", message: "Scheduling configuration not found." });
    }

    const config = configResult.rows[0];
    if (!config.enabled) {
      await client.query("COMMIT");
      return res.json({ status: "disabled", message: "Scheduling is disabled; no jobs created.", configuration: config });
    }

    const recurring = config.frequency === "daily" || config.frequency === "weekly";
    if ((config.frequency != null && !["once", "daily", "weekly"].includes(config.frequency)) ||
        config.timezone !== "Asia/Jerusalem" ||
        (recurring && (!Number.isInteger(config.interval_count) ||
          config.interval_count < 1 || config.interval_count > 365 || !config.local_run_time))) {
      await client.query("ROLLBACK");
      return res.status(409).json({ status: "unconfigured", message: "Invalid frequency, interval_count, local_run_time, or timezone." });
    }

    if (!config.next_run_at || !config.default_topic || !config.default_topic.trim()) {
      await client.query("ROLLBACK");
      return res.status(409).json({ status: "unconfigured", message: "Set next_run_at and default_topic before enabling scheduling." });
    }

    const nowResult = await client.query("SELECT clock_timestamp() AS now");
    const now = nowResult.rows[0].now;
    if (new Date(config.next_run_at) > new Date(now)) {
      await client.query("COMMIT");
      return res.json({ status: "not_due", message: "The next scheduled run is in the future.", next_run_at: config.next_run_at });
    }

    const jobResult = await client.query(
      `INSERT INTO public.jobs (topic, scheduler_slot_at)
       VALUES ($1, $2)
       ON CONFLICT (scheduler_slot_at) WHERE scheduler_slot_at IS NOT NULL DO NOTHING
       RETURNING *`,
      [config.default_topic.trim(), config.next_run_at]
    );

    // Advance from the consumed slot, never from the cron request time.
    // Keep the configured wall time even after a DST gap shifts one occurrence.
    let nextRunAt = null;
    if (recurring) {
      const updated = await client.query(
        `UPDATE public.schedule_config
         SET next_run_at = (
               ((next_run_at AT TIME ZONE timezone)::date + $2::integer)
               + local_run_time
             ) AT TIME ZONE timezone,
             updated_at = NOW()
         WHERE id = $1
         RETURNING next_run_at`,
        [config.id, config.interval_count * (config.frequency === "weekly" ? 7 : 1)]
      );
      nextRunAt = updated.rows[0].next_run_at;
    } else {
      await client.query(
        `UPDATE public.schedule_config
         SET enabled = FALSE, next_run_at = NULL, updated_at = NOW()
         WHERE id = $1`,
        [config.id]
      );
    }
    await client.query("COMMIT");

    if (jobResult.rowCount === 0) {
      return res.json({ status: "already_processed", message: "This scheduled slot already produced a job; schedule advanced.", next_run_at: nextRunAt });
    }
    return res.status(201).json({ status: "created", message: recurring ? "One scheduled job created; schedule advanced." : "One scheduled job created; scheduling disabled.", job: jobResult.rows[0], next_run_at: nextRunAt });
  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch (rollbackError) {
        releaseError = rollbackError;
        console.error("Scheduler rollback failed", { code: rollbackError.code || "UNKNOWN" });
      }
    }
    console.error("Scheduler failed", { code: error.code || "UNKNOWN" });
    return res.status(500).json({ error: "Scheduler failed", code: "SCHEDULER_FAILED", message: "Retry the scheduler request; scheduled slots are protected against duplicates." });
  } finally {
    if (client) client.release(releaseError);
  }
});

module.exports = router;
