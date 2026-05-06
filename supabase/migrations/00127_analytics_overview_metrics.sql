-- Expand analytics_overview_v1 with per-day breakdowns of logins, chat messages,
-- score saves, gallery uploads, and errors. Add analytics_day_detail for tap-into-day.

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
    COUNT(*) FILTER (WHERE al.event_type = 'page_view')::int AS page_views,
    COUNT(*) FILTER (WHERE al.event_type = 'login')::int AS logins,
    COUNT(*) FILTER (WHERE al.event_type = 'chat_message')::int AS chat_messages,
    COUNT(*) FILTER (WHERE al.event_type = 'score_save')::int AS score_saves,
    COUNT(*) FILTER (WHERE al.event_type = 'gallery_upload')::int AS gallery_uploads,
    COUNT(*) FILTER (WHERE al.event_type = 'notification_click')::int AS notification_clicks,
    COUNT(*) FILTER (WHERE al.event_type = 'error')::int AS errors
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
    'thirty_logins', (SELECT COUNT(*) FROM activity_log WHERE event_type = 'login' AND created_at >= now() - interval '30 days'),
    'thirty_chat_messages', (SELECT COUNT(*) FROM activity_log WHERE event_type = 'chat_message' AND created_at >= now() - interval '30 days'),
    'thirty_score_saves', (SELECT COUNT(*) FROM activity_log WHERE event_type = 'score_save' AND created_at >= now() - interval '30 days'),
    'thirty_gallery_uploads', (SELECT COUNT(*) FROM activity_log WHERE event_type = 'gallery_upload' AND created_at >= now() - interval '30 days'),
    'thirty_notification_clicks', (SELECT COUNT(*) FROM activity_log WHERE event_type = 'notification_click' AND created_at >= now() - interval '30 days'),
    'thirty_errors', (SELECT COUNT(*) FROM activity_log WHERE event_type = 'error' AND created_at >= now() - interval '30 days'),
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

-- Per-day breakdown including active users with their event counts.
CREATE OR REPLACE FUNCTION analytics_day_detail(target_day date)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH window_bounds AS (
  SELECT
    target_day::timestamptz AS day_start,
    (target_day + interval '1 day')::timestamptz AS day_end
),
day_events AS (
  SELECT al.*
  FROM activity_log al, window_bounds w
  WHERE al.created_at >= w.day_start AND al.created_at < w.day_end
),
per_user AS (
  SELECT
    de.user_id,
    COUNT(*)::int AS events,
    COUNT(*) FILTER (WHERE de.event_type = 'page_view')::int AS page_views,
    COUNT(*) FILTER (WHERE de.event_type = 'chat_message')::int AS chat_messages,
    COUNT(*) FILTER (WHERE de.event_type = 'score_save')::int AS score_saves,
    MAX(de.created_at) AS last_seen
  FROM day_events de
  GROUP BY de.user_id
)
SELECT jsonb_build_object(
  'day', target_day,
  'metrics', jsonb_build_object(
    'users', (SELECT COUNT(DISTINCT user_id) FROM day_events),
    'page_views', (SELECT COUNT(*) FROM day_events WHERE event_type = 'page_view'),
    'logins', (SELECT COUNT(*) FROM day_events WHERE event_type = 'login'),
    'chat_messages', (SELECT COUNT(*) FROM day_events WHERE event_type = 'chat_message'),
    'score_saves', (SELECT COUNT(*) FROM day_events WHERE event_type = 'score_save'),
    'gallery_uploads', (SELECT COUNT(*) FROM day_events WHERE event_type = 'gallery_upload'),
    'notification_clicks', (SELECT COUNT(*) FROM day_events WHERE event_type = 'notification_click'),
    'errors', (SELECT COUNT(*) FROM day_events WHERE event_type = 'error')
  ),
  'active_users', (
    SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.events DESC, t.display_name), '[]'::jsonb)
    FROM (
      SELECT
        u.id,
        u.display_name,
        u.avatar_url,
        pu.events,
        pu.page_views,
        pu.chat_messages,
        pu.score_saves,
        pu.last_seen
      FROM per_user pu
      JOIN users u ON u.id = pu.user_id
    ) t
  ),
  'top_pages', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT page_path, COUNT(*)::int AS views
      FROM day_events
      WHERE event_type = 'page_view' AND page_path IS NOT NULL
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT 10
    ) t
  )
);
$$;
