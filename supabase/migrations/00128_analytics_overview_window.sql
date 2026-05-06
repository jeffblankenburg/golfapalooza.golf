-- Switch analytics_overview_v1 to a single `window_days` param that drives the
-- daily aggregation, the totals row, and the inactive-Loozers cutoff. Drop the
-- prior signature so the function gets cleanly replaced.

DROP FUNCTION IF EXISTS analytics_overview_v1(int);

CREATE OR REPLACE FUNCTION analytics_overview_v1(window_days int DEFAULT 7)
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
window_events AS (
  SELECT al.*
  FROM activity_log al
  WHERE al.created_at >= (now() - (window_days || ' days')::interval)
),
daily AS (
  SELECT
    date_trunc('day', we.created_at)::date AS day,
    COUNT(DISTINCT we.user_id)::int AS users,
    COUNT(*) FILTER (WHERE we.event_type = 'page_view')::int AS page_views,
    COUNT(*) FILTER (WHERE we.event_type = 'login')::int AS logins,
    COUNT(*) FILTER (WHERE we.event_type = 'chat_message')::int AS chat_messages,
    COUNT(*) FILTER (WHERE we.event_type = 'score_save')::int AS score_saves,
    COUNT(*) FILTER (WHERE we.event_type = 'gallery_upload')::int AS gallery_uploads,
    COUNT(*) FILTER (WHERE we.event_type = 'notification_click')::int AS notification_clicks,
    COUNT(*) FILTER (WHERE we.event_type = 'error')::int AS errors
  FROM window_events we
  GROUP BY 1
  ORDER BY 1
)
SELECT jsonb_build_object(
  'window_days', window_days,
  'daily', (SELECT coalesce(jsonb_agg(row_to_json(d)), '[]'::jsonb) FROM daily d),
  'totals', jsonb_build_object(
    'users', (SELECT COUNT(DISTINCT user_id) FROM window_events),
    'page_views', (SELECT COUNT(*) FROM window_events WHERE event_type = 'page_view'),
    'logins', (SELECT COUNT(*) FROM window_events WHERE event_type = 'login'),
    'chat_messages', (SELECT COUNT(*) FROM window_events WHERE event_type = 'chat_message'),
    'score_saves', (SELECT COUNT(*) FROM window_events WHERE event_type = 'score_save'),
    'gallery_uploads', (SELECT COUNT(*) FROM window_events WHERE event_type = 'gallery_upload'),
    'notification_clicks', (SELECT COUNT(*) FROM window_events WHERE event_type = 'notification_click'),
    'errors', (SELECT COUNT(*) FROM window_events WHERE event_type = 'error'),
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
      WHERE ls.last_active IS NULL OR ls.last_active < now() - (window_days || ' days')::interval
      ORDER BY ls.last_active ASC NULLS FIRST, e.display_name
    ) t
  )
);
$$;
