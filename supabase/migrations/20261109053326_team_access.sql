-- CLI-generated migration aligned to hosted version 20261109053326 after application.
BEGIN;
CREATE TABLE public.team_members (
  -- Logical Supabase user ID: retain audit identity without blocking managed-user deletion.
  id uuid PRIMARY KEY,
  role text NOT NULL CHECK(role IN ('admin','operator','reviewer')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.team_sessions (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  provider_session_id uuid NOT NULL UNIQUE,
  csrf_hash text NOT NULL CHECK(csrf_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_session_member ON public.team_sessions(member_id);
CREATE INDEX team_session_expiry ON public.team_sessions(expires_at);
CREATE TABLE public.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES public.team_members(id) ON DELETE RESTRICT,
  actor_kind text NOT NULL CHECK(actor_kind IN ('human','service','bootstrap')),
  action text NOT NULL,
  target_id uuid,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_actor ON public.audit_events(actor_id,created_at);
CREATE INDEX audit_target ON public.audit_events(target_id,created_at);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_members,public.team_sessions,public.audit_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.audit_events_id_seq FROM PUBLIC,anon,authenticated;
COMMIT;
