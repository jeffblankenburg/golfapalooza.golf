-- Enroll every migrated profile into the Golfapalooza org as an active member.
-- Role mapping: legacy is_admin → 'admin', everyone else → 'member'.
-- The org creator already holds an 'owner' membership; ON CONFLICT DO NOTHING
-- preserves it (never downgrades owner → admin). Idempotent / re-runnable.
--
-- Depends on 00186 (profiles must exist). Enrolls only non-system users who have
-- a v2_profiles row.

INSERT INTO public.v2_memberships (org_id, user_id, role, status)
SELECT
  o.id,
  u.id,
  CASE WHEN u.is_admin IS TRUE THEN 'admin' ELSE 'member' END,
  'active'
FROM public.users u
JOIN public.v2_profiles p ON p.id = u.id
CROSS JOIN (
  SELECT id FROM public.v2_organizations WHERE slug = 'golfapalooza' LIMIT 1
) o
WHERE u.is_system IS NOT TRUE
ON CONFLICT (org_id, user_id) DO NOTHING;
