BEGIN;
CREATE TABLE public.publishing_config (
  id integer PRIMARY KEY CHECK(id=1),enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'mock' CHECK(mode='mock'),
  location_id text NOT NULL DEFAULT 'mock_location' CHECK(location_id ~ '^mock_[A-Za-z0-9_-]+$'),
  user_id text NOT NULL DEFAULT 'mock_user' CHECK(user_id ~ '^mock_[A-Za-z0-9_-]+$'),
  max_submissions integer NOT NULL DEFAULT 0 CHECK(max_submissions BETWEEN 0 AND 100),
  submissions_used integer NOT NULL DEFAULT 0 CHECK(submissions_used>=0)
);
INSERT INTO public.publishing_config(id) VALUES(1);
CREATE TABLE public.publishing_accounts (
  id text PRIMARY KEY CHECK(id ~ '^mock_[A-Za-z0-9_-]+$'),
  platform text NOT NULL CHECK(platform='facebook'),label text NOT NULL CHECK(length(label) BETWEEN 1 AND 100),
  enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE public.publishing_requests (
  id uuid PRIMARY KEY,job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  approval_id uuid NOT NULL REFERENCES public.approval_requests(id),
  account_id text NOT NULL REFERENCES public.publishing_accounts(id),
  mode text NOT NULL DEFAULT 'mock' CHECK(mode='mock'),snapshot_hash text NOT NULL,
  location_id text NOT NULL,payload jsonb NOT NULL,
  state text NOT NULL CHECK(state IN ('submitting','needs_reconciliation','submitted','scheduled','published','failed')),
  token uuid NOT NULL,lease_until timestamptz NOT NULL,
  external_post_id text UNIQUE CHECK(external_post_id IS NULL OR external_post_id ~ '^mock_[A-Za-z0-9_-]+$'),
  error_code text,next_check_at timestamptz NOT NULL DEFAULT now(),
  checks integer NOT NULL DEFAULT 0 CHECK(checks BETWEEN 0 AND 60),
  published_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(approval_id,account_id)
);
CREATE INDEX publication_job ON public.publishing_requests(job_id,created_at);
CREATE INDEX publication_account ON public.publishing_requests(account_id);
ALTER TABLE public.publishing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishing_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publishing_config,public.publishing_accounts,public.publishing_requests FROM PUBLIC,anon,authenticated;
COMMIT;
