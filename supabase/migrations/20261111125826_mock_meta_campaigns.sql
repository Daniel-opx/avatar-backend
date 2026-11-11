BEGIN;
CREATE TABLE public.meta_config (
  id integer PRIMARY KEY CHECK (id=1), enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'mock' CHECK (mode='mock'),
  max_drafts integer NOT NULL DEFAULT 0 CHECK (max_drafts BETWEEN 0 AND 100),
  drafts_used integer NOT NULL DEFAULT 0 CHECK (drafts_used>=0),
  max_lifetime_minor integer NOT NULL DEFAULT 0 CHECK (max_lifetime_minor BETWEEN 0 AND 100000)
);
INSERT INTO public.meta_config(id) VALUES(1);
CREATE TABLE public.meta_drafts (
  id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  approval_id uuid NOT NULL REFERENCES public.approval_requests(id),
  content_hash text NOT NULL, spec jsonb NOT NULL, spec_hash text NOT NULL,
  mode text NOT NULL DEFAULT 'mock' CHECK (mode='mock'),
  created_by uuid NOT NULL REFERENCES public.team_members(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(approval_id,spec_hash)
);
CREATE INDEX meta_draft_job ON public.meta_drafts(job_id,created_at);
CREATE INDEX meta_draft_creator ON public.meta_drafts(created_by);
CREATE TABLE public.meta_decisions (
  id uuid PRIMARY KEY, draft_id uuid NOT NULL REFERENCES public.meta_drafts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('budget','activation')),
  spec_hash text NOT NULL, approved_by uuid NOT NULL REFERENCES public.team_members(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(draft_id,kind)
);
CREATE INDEX meta_decision_actor ON public.meta_decisions(approved_by);
CREATE TABLE public.meta_operations (
  id uuid PRIMARY KEY, draft_id uuid NOT NULL REFERENCES public.meta_drafts(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('campaign','adset','creative','ad')),
  state text NOT NULL CHECK (state IN ('submitting','needs_reconciliation','succeeded','failed')),
  payload jsonb NOT NULL, token uuid NOT NULL, lease_until timestamptz NOT NULL,
  external_id text UNIQUE CHECK (external_id IS NULL OR external_id ~ '^mock_[A-Za-z0-9_-]+$'),
  error_code text, checks integer NOT NULL DEFAULT 0 CHECK (checks BETWEEN 0 AND 3),
  next_check_at timestamptz NOT NULL DEFAULT now(), last_status text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(draft_id,stage)
);
ALTER TABLE public.meta_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_config,public.meta_drafts,public.meta_decisions,public.meta_operations FROM PUBLIC,anon,authenticated;
COMMIT;
