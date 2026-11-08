-- CLI-generated migration aligned to hosted version 20261108191748 after application.
BEGIN;
CREATE TABLE public.asset_config (
  id integer PRIMARY KEY CHECK (id=1),
  enabled boolean NOT NULL DEFAULT false,
  avatar_id text,
  voice_id text,
  voice_mode text NOT NULL DEFAULT 'builtin' CHECK (voice_mode IN ('builtin','external_mock')),
  storage_bucket text,
  storage_origin text,
  retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 365)
);
INSERT INTO public.asset_config(id) VALUES(1);
CREATE TABLE public.job_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image','audio','video')),
  bucket text NOT NULL,
  object_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready','expired','retired')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(job_id,revision) REFERENCES public.content_versions(job_id,revision),
  UNIQUE(job_id,revision,bucket,object_key)
);
CREATE INDEX assets_revision ON public.job_assets(job_id,revision,created_at);
CREATE INDEX assets_expiry ON public.job_assets(expires_at) WHERE state='ready' AND expires_at IS NOT NULL;
CREATE TABLE public.asset_manifests (
  job_id uuid NOT NULL,
  revision integer NOT NULL,
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(job_id,revision),
  FOREIGN KEY(job_id,revision) REFERENCES public.content_versions(job_id,revision) ON DELETE CASCADE
);
ALTER TABLE public.asset_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_manifests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_config,public.job_assets,public.asset_manifests FROM PUBLIC,anon,authenticated;
COMMIT;
