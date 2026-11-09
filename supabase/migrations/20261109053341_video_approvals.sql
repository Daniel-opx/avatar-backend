-- CLI-generated migration aligned to hosted version 20261109053341 after application.
BEGIN;
CREATE FUNCTION public.approval_snapshot(target uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object('job_id',j.id,'revision',p.content_revision,'topic',j.topic,
    'script',j.script,'visual_plan',j.visual_plan,'content',c.package,
    'render_request_id',r.id,'render_payload',r.payload,
    'media',jsonb_build_object('mode',m.mode,'bucket',m.bucket,'object_key',m.object_key,
      'sha256',m.sha256,'size_bytes',m.size_bytes,'mime_type',m.mime_type,'duration_seconds',m.duration_seconds),
    'ready',r.state='completed' AND m.state='ready' AND p.stage='review' AND p.state='succeeded'
      AND j.status IN ('ready_for_review','approved')
      AND j.script=c.package->>'script' AND j.visual_plan=c.package->'visual_plan')
  FROM public.jobs j JOIN public.job_processing p ON p.job_id=j.id
    JOIN public.content_versions c ON c.job_id=j.id AND c.revision=p.content_revision
    JOIN public.render_requests r ON r.job_id=j.id AND r.revision=p.content_revision
    JOIN public.video_media m ON m.render_request_id=r.id WHERE j.id=target;
$$;
REVOKE ALL ON FUNCTION public.approval_snapshot(uuid) FROM PUBLIC,anon,authenticated;
CREATE TABLE public.approval_requests (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  render_request_id uuid NOT NULL REFERENCES public.video_media(render_request_id) ON DELETE RESTRICT,
  mode text NOT NULL DEFAULT 'mock' CHECK(mode='mock'),
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected','revision_requested','superseded')),
  requested_by uuid REFERENCES public.team_members(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  replacement_revision integer,
  revision_key uuid UNIQUE,
  revision_topic_hash text,
  UNIQUE(job_id,revision,snapshot_hash),
  FOREIGN KEY(job_id,revision) REFERENCES public.content_versions(job_id,revision) ON DELETE RESTRICT,
  CHECK((replacement_revision IS NULL AND revision_key IS NULL AND revision_topic_hash IS NULL)
    OR (replacement_revision>revision AND revision_key IS NOT NULL AND revision_topic_hash IS NOT NULL))
);
CREATE TABLE public.approval_decisions (
  request_id uuid PRIMARY KEY REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  decision_key uuid NOT NULL UNIQUE,
  reviewer_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN ('approved','rejected','revision_requested')),
  comment text NOT NULL DEFAULT '' CHECK(length(comment)<=4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.approval_notifications (
  request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('review_requested','decision')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  PRIMARY KEY(request_id,recipient_id,kind)
);
CREATE INDEX approval_job ON public.approval_requests(job_id,created_at);
CREATE INDEX approval_render ON public.approval_requests(render_request_id);
CREATE INDEX approval_requester ON public.approval_requests(requested_by);
CREATE INDEX decision_reviewer ON public.approval_decisions(reviewer_id);
CREATE INDEX notification_inbox ON public.approval_notifications(recipient_id,created_at);
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.approval_requests,public.approval_decisions,public.approval_notifications FROM PUBLIC,anon,authenticated;
-- Publishing is still absent. Fail closed even for direct legacy job-status writes.
CREATE FUNCTION public.require_publication_approval() RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.status IN ('scheduled','published') OR NEW.ghl_post_id IS NOT NULL THEN
    -- Only mock video modes exist today; mock approval can never authorize publication.
    RAISE EXCEPTION 'Publication is disabled until live media approval is implemented' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_publication_approval() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER require_publication_approval BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.require_publication_approval();
COMMIT;
