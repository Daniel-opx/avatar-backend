-- CLI-generated migration aligned to hosted version 20261108193747 after application.
BEGIN;
CREATE TABLE public.render_config (
  id integer PRIMARY KEY CHECK(id=1),
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'mock' CHECK(mode='mock'),
  engine text NOT NULL DEFAULT 'avatar_iv' CHECK(engine IN ('avatar_iii','avatar_iv','avatar_v')),
  resolution text NOT NULL DEFAULT '720p' CHECK(resolution IN ('720p','1080p')),
  aspect_ratio text NOT NULL DEFAULT '9:16' CHECK(aspect_ratio IN ('9:16','16:9','1:1','auto')),
  max_submissions integer NOT NULL DEFAULT 0 CHECK(max_submissions BETWEEN 0 AND 1000),
  submissions_used integer NOT NULL DEFAULT 0 CHECK(submissions_used>=0),
  poll_after_seconds integer NOT NULL DEFAULT 30 CHECK(poll_after_seconds BETWEEN 5 AND 300),
  max_polls integer NOT NULL DEFAULT 60 CHECK(max_polls BETWEEN 1 AND 120)
);
INSERT INTO public.render_config(id) VALUES(1);
CREATE TABLE public.render_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  revision integer NOT NULL,
  mode text NOT NULL DEFAULT 'mock' CHECK(mode='mock'),
  state text NOT NULL CHECK(state IN ('submitting','retry_wait','pending','polling','completed','failed','needs_reconciliation')),
  token uuid NOT NULL,
  payload jsonb NOT NULL,
  external_video_id text UNIQUE CHECK(external_video_id IS NULL OR external_video_id ~ '^mock_[A-Za-z0-9_-]+$'),
  submission_attempts integer NOT NULL DEFAULT 1 CHECK(submission_attempts BETWEEN 1 AND 3),
  polls integer NOT NULL DEFAULT 0 CHECK(polls BETWEEN 0 AND 120),
  poll_failures integer NOT NULL DEFAULT 0,
  max_polls integer NOT NULL CHECK(max_polls BETWEEN 1 AND 120),
  poll_after_seconds integer NOT NULL CHECK(poll_after_seconds BETWEEN 5 AND 300),
  next_action_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id,revision),
  FOREIGN KEY(job_id,revision) REFERENCES public.asset_manifests(job_id,revision) ON DELETE CASCADE
);
CREATE TABLE public.render_calls (
  token uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.render_requests(id) ON DELETE CASCADE,
  action text NOT NULL CHECK(action IN ('submit','poll')),
  outcome text NOT NULL DEFAULT 'running',
  error_code text,
  http_status integer,
  provider_request_id text,
  estimated_cost_usd numeric CHECK(estimated_cost_usd>=0),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer
);
CREATE INDEX render_calls_request ON public.render_calls(request_id,started_at);
ALTER TABLE public.render_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.render_config,public.render_requests,public.render_calls FROM PUBLIC,anon,authenticated;
COMMIT;
