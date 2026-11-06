BEGIN;
CREATE TABLE public.processing_config (
  id integer PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.processing_config (id) VALUES (1);

CREATE TABLE public.job_processing (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'content' CHECK (stage IN ('content','assets','render','review')),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN
    ('queued','running','retry_wait','succeeded','failed','cancelled','needs_reconciliation')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  retry_safe boolean NOT NULL DEFAULT false,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'running') = (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX processing_due ON public.job_processing(next_attempt_at, job_id)
  WHERE state IN ('queued','retry_wait');
CREATE INDEX processing_expired ON public.job_processing(lease_until) WHERE state = 'running';

CREATE TABLE public.job_attempts (
  token uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.job_processing(job_id) ON DELETE CASCADE,
  stage text NOT NULL,
  attempt integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text NOT NULL DEFAULT 'running',
  error_code text
);
CREATE INDEX attempts_job ON public.job_attempts(job_id, started_at);
CREATE TABLE public.job_checkpoints (
  job_id uuid NOT NULL REFERENCES public.job_processing(job_id) ON DELETE CASCADE,
  stage text NOT NULL,
  output jsonb NOT NULL,
  completed boolean NOT NULL DEFAULT true,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id,stage)
);
CREATE TABLE public.job_processing_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.job_processing(job_id) ON DELETE CASCADE,
  event text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only new jobs are enrolled. Existing rows are deliberately not backfilled.
CREATE FUNCTION public.enqueue_job() RETURNS trigger LANGUAGE plpgsql
  SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.job_processing(job_id) VALUES (NEW.id);
  INSERT INTO public.job_processing_events(job_id,event) VALUES (NEW.id,'created');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_job() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enqueue_job AFTER INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_job();

ALTER TABLE public.processing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_processing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_processing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.processing_config, public.job_processing, public.job_attempts,
  public.job_checkpoints, public.job_processing_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.job_processing_events_id_seq FROM PUBLIC, anon, authenticated;
COMMIT;
