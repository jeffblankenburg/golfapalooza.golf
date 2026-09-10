-- v2 photo gallery. Mirrors the legacy gallery (items/reactions/comments/tags)
-- but org-scoped and v2-owned. History is imported separately (00199) preserving
-- original UUIDs, so IDs are plain uuid PKs (default for new rows). `bulk_id`
-- groups a multi-file upload so the activity feed can emit ONE entry per bulk.

DROP TABLE IF EXISTS public.v2_gallery_tags;
DROP TABLE IF EXISTS public.v2_gallery_comments;
DROP TABLE IF EXISTS public.v2_gallery_reactions;
DROP TABLE IF EXISTS public.v2_gallery_items;
DROP FUNCTION IF EXISTS public.v2_gallery_member(UUID);

CREATE TABLE public.v2_gallery_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES public.v2_events(id) ON DELETE SET NULL,
  uploader_id     UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  legacy_item_id  UUID UNIQUE,
  bulk_id         UUID,
  media_url       TEXT NOT NULL,
  thumbnail_url   TEXT,
  media_type      TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  caption         TEXT,
  width           SMALLINT,
  height          SMALLINT,
  taken_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sort_date       TIMESTAMPTZ GENERATED ALWAYS AS (COALESCE(taken_at, created_at)) STORED
);
CREATE INDEX idx_v2_gallery_org_sort ON public.v2_gallery_items(org_id, sort_date DESC);

CREATE TABLE public.v2_gallery_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID NOT NULL REFERENCES public.v2_gallery_items(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id, emoji)
);
CREATE INDEX idx_v2_gallery_reactions_item ON public.v2_gallery_reactions(item_id);

CREATE TABLE public.v2_gallery_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID NOT NULL REFERENCES public.v2_gallery_items(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_v2_gallery_comments_item ON public.v2_gallery_comments(item_id, created_at);

CREATE TABLE public.v2_gallery_tags (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID NOT NULL REFERENCES public.v2_gallery_items(id) ON DELETE CASCADE,
  tagged_user_id UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  tagger_id      UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, tagged_user_id)
);
CREATE INDEX idx_v2_gallery_tags_item ON public.v2_gallery_tags(item_id);

-- Membership by item's org (SECURITY DEFINER — for child-table RLS without recursion).
CREATE FUNCTION public.v2_gallery_member(p_item UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.v2_gallery_items i
    JOIN public.v2_memberships m ON m.org_id = i.org_id
    WHERE i.id = p_item AND m.user_id = auth.uid() AND m.status = 'active'
  );
$$;

ALTER TABLE public.v2_gallery_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_gallery_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_gallery_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_gallery_tags      ENABLE ROW LEVEL SECURITY;

-- Items: org members read; uploader creates own; uploader/admin delete/update.
CREATE POLICY "v2_gi_select" ON public.v2_gallery_items FOR SELECT
  TO authenticated USING (public.v2_is_org_member(org_id));
CREATE POLICY "v2_gi_insert" ON public.v2_gallery_items FOR INSERT
  TO authenticated WITH CHECK (uploader_id = auth.uid() AND public.v2_is_org_member(org_id));
CREATE POLICY "v2_gi_modify" ON public.v2_gallery_items FOR UPDATE
  TO authenticated USING (uploader_id = auth.uid() OR public.v2_is_org_admin(org_id))
  WITH CHECK (uploader_id = auth.uid() OR public.v2_is_org_admin(org_id));
CREATE POLICY "v2_gi_delete" ON public.v2_gallery_items FOR DELETE
  TO authenticated USING (uploader_id = auth.uid() OR public.v2_is_org_admin(org_id));

-- Reactions / comments / tags: any org member of the item can read/write.
CREATE POLICY "v2_gr_all" ON public.v2_gallery_reactions FOR ALL
  TO authenticated USING (public.v2_gallery_member(item_id)) WITH CHECK (public.v2_gallery_member(item_id));
CREATE POLICY "v2_gc_all" ON public.v2_gallery_comments FOR ALL
  TO authenticated USING (public.v2_gallery_member(item_id)) WITH CHECK (public.v2_gallery_member(item_id));
CREATE POLICY "v2_gt_all" ON public.v2_gallery_tags FOR ALL
  TO authenticated USING (public.v2_gallery_member(item_id)) WITH CHECK (public.v2_gallery_member(item_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_gallery_items     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_gallery_reactions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_gallery_comments  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_gallery_tags      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.v2_gallery_member(UUID) TO authenticated, service_role;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_gallery_items;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_gallery_reactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_gallery_comments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
