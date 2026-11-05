BEGIN;

ALTER TABLE public.schedule_config
  ADD COLUMN IF NOT EXISTS interval_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS local_run_time time without time zone;

-- NULL frequency preserves the existing one-time configuration.
-- Replace the existing daily/weekly/custom constraint found in Supabase.
ALTER TABLE public.schedule_config
  DROP CONSTRAINT IF EXISTS schedule_config_frequency_check,
  DROP CONSTRAINT IF EXISTS schedule_config_interval_check,
  DROP CONSTRAINT IF EXISTS schedule_config_recurring_time_check,
  DROP CONSTRAINT IF EXISTS schedule_config_timezone_check;

ALTER TABLE public.schedule_config
  ADD CONSTRAINT schedule_config_frequency_check
    CHECK (frequency IS NULL OR frequency IN ('once', 'daily', 'weekly')),
  ADD CONSTRAINT schedule_config_interval_check
    CHECK (interval_count BETWEEN 1 AND 365),
  ADD CONSTRAINT schedule_config_recurring_time_check
    CHECK (frequency IS NULL OR frequency = 'once' OR local_run_time IS NOT NULL),
  ADD CONSTRAINT schedule_config_timezone_check
    CHECK (timezone = 'Asia/Jerusalem');

-- Does not enable scheduling or change next_run_at.
COMMIT;
