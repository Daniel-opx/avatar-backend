-- CLI-generated migration aligned to hosted version 20261108200903 after application.
BEGIN;
CREATE TABLE public.completion_config (
  id integer PRIMARY KEY CHECK(id=1),
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'mock' CHECK(mode='mock'),
  private_bucket text NOT NULL DEFAULT 'mock-videos',
  review_ttl_seconds integer NOT NULL DEFAULT 300 CHECK(review_ttl_seconds BETWEEN 30 AND 900),
  max_bytes integer NOT NULL DEFAULT 52428800 CHECK(max_bytes BETWEEN 1 AND 104857600)
);
INSERT INTO public.completion_config(id) VALUES(1);
CREATE TABLE public.webhook_events (
  dedupe_key text PRIMARY KEY CHECK(length(dedupe_key)=64),
  provider_event_id text UNIQUE,
  external_video_id text NOT NULL CHECK(external_video_id ~ '^mock_[A-Za-z0-9_-]+$'),
  event_type text NOT NULL CHECK(event_type IN ('avatar_video.success','avatar_video.fail')),
  render_request_id uuid REFERENCES public.render_requests(id) ON DELETE CASCADE,
  body_sha256 text NOT NULL CHECK(length(body_sha256)=64),
  state text NOT NULL CHECK(state IN ('received','unmatched','processed','ignored','conflict')),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_request ON public.webhook_events(render_request_id,received_at);
CREATE INDEX webhook_video ON public.webhook_events(external_video_id);
CREATE TABLE public.video_media (
  render_request_id uuid PRIMARY KEY REFERENCES public.render_requests(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'mock' CHECK(mode='mock'),
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','waiting','ready','failed')),
  token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  checks integer NOT NULL DEFAULT 0 CHECK(checks BETWEEN 0 AND 120),
  next_check_at timestamptz NOT NULL DEFAULT now(),
  bucket text,
  object_key text,
  mime_type text,
  size_bytes integer,
  sha256 text,
  duration_seconds numeric,
  error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((state='running')=(token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK(state<>'ready' OR (bucket IS NOT NULL AND object_key IS NOT NULL AND
    mime_type IS NOT NULL AND mime_type='video/mp4' AND size_bytes IS NOT NULL AND size_bytes>0
    AND sha256 IS NOT NULL AND sha256 ~ '^[a-f0-9]{64}$'))
);
CREATE TABLE public.review_grants (
  token_hash text PRIMARY KEY CHECK(length(token_hash)=64),
  render_request_id uuid NOT NULL REFERENCES public.video_media(render_request_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_request ON public.review_grants(render_request_id);
CREATE INDEX review_expiry ON public.review_grants(expires_at);
ALTER TABLE public.completion_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.completion_config,public.webhook_events,public.video_media,public.review_grants FROM PUBLIC,anon,authenticated;
COMMIT;
