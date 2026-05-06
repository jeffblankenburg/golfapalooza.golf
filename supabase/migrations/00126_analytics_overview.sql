-- Admin analytics overview: daily totals, users without PWA install, inactive users.
-- Powers /admin/analytics for any user with admin or any permission.

CREATE OR REPLACE FUNCTION analytics_overview_v1(inactive_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH eligible AS (
  SELECT u.id, u.display_name, u.avatar_url
  FROM users u
  WHERE COALESCE(u.is_system, false) = false
    AND COALESCE(u.is_financial_only, false) = false
),
last_seen AS (
  SELECT al.user_id, MAX(al.created_at) AS last_active
  FROM activity_log al
  WHERE al.event_type = 'page_view'
  GROUP BY al.user_id
),
pwa_users AS (
  SELECT DISTINCT al.user_id
  FROM activity_log al
  WHERE al.metadata->>'pwa' = 'true'
),
daily AS (
  SELECT
    date_trunc('day', al.created_at)::date AS day,
    COUNT(DISTINCT al.user_id)::int AS users,
    COUNT(*) FILTER (WHERE al.event_type = 'page_view')::int AS page_views
  FROM activity_log al
  WHERE al.created_at >= (now() - interval '30 days')
  GROUP BY 1
  ORDER BY 1
)
SELECT jsonb_build_object(
  'daily', (SELECT coalesce(jsonb_agg(row_to_json(d)), '[]'::jsonb) FROM daily d),
  'totals', jsonb_build_object(
    'today_users', (SELECT COUNT(DISTINCT user_id) FROM activity_log WHERE created_at >= date_trunc('day', now())),
    'today_views', (SELECT COUNT(*) FROM activity_log WHERE event_type = 'page_view' AND created_at >= date_trunc('day', now())),
    'week_users', (SELECT COUNT(DISTINCT user_id) FROM activity_log WHERE created_at >= now() - interval '7 days'),
    'week_views', (SELECT COUNT(*) FROM activity_log WHERE event_type = 'page_view' AND created_at >= now() - interval '7 days'),
    'thirty_users', (SELECT COUNT(DISTINCT user_id) FROM activity_log WHERE created_at >= now() - interval '30 days'),
    'thirty_views', (SELECT COUNT(*) FROM activity_log WHERE event_type = 'page_view' AND created_at >= now() - interval '30 days'),
    'eligible_users', (SELECT COUNT(*) FROM eligible)
  ),
  'no_pwa', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT e.id, e.display_name, e.avatar_url, ls.last_active
      FROM eligible e
      LEFT JOIN last_seen ls ON ls.user_id = e.id
      WHERE NOT EXISTS (SELECT 1 FROM pwa_users p WHERE p.user_id = e.id)
      ORDER BY e.display_name
    ) t
  ),
  'inactive', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT e.id, e.display_name, e.avatar_url, ls.last_active
      FROM eligible e
      LEFT JOIN last_seen ls ON ls.user_id = e.id
      WHERE ls.last_active IS NULL OR ls.last_active < now() - (inactive_days || ' days')::interval
      ORDER BY ls.last_active ASC NULLS FIRST, e.display_name
    ) t
  )
);
$$;
