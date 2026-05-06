-- Add per-Loozer window-scoped activity breakdown to analytics_overview_v1.
-- Powers the sortable "active Loozers in this window" table on /admin/analytics.

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
window_song_plays AS (
  SELECT sp.*
  FROM song_plays sp
  WHERE sp.played_at >= (now() - (window_days || ' days')::interval)
),
daily_events AS (
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
),
daily_songs AS (
  SELECT
    date_trunc('day', wsp.played_at)::date AS day,
    COUNT(*)::int AS song_plays
  FROM window_song_plays wsp
  GROUP BY 1
),
daily AS (
  SELECT
    COALESCE(de.day, ds.day) AS day,
    COALESCE(de.users, 0) AS users,
    COALESCE(de.page_views, 0) AS page_views,
    COALESCE(de.logins, 0) AS logins,
    COALESCE(de.chat_messages, 0) AS chat_messages,
    COALESCE(de.score_saves, 0) AS score_saves,
    COALESCE(de.gallery_uploads, 0) AS gallery_uploads,
    COALESCE(de.notification_clicks, 0) AS notification_clicks,
    COALESCE(de.errors, 0) AS errors,
    COALESCE(ds.song_plays, 0) AS song_plays
  FROM daily_events de
  FULL OUTER JOIN daily_songs ds ON de.day = ds.day
  ORDER BY day
),
per_user_events AS (
  SELECT
    we.user_id,
    COUNT(*)::int AS events,
    COUNT(*) FILTER (WHERE we.event_type = 'page_view')::int AS page_views,
    COUNT(*) FILTER (WHERE we.event_type = 'chat_message')::int AS chat_messages,
    COUNT(*) FILTER (WHERE we.event_type = 'gallery_upload')::int AS gallery_uploads,
    MAX(we.created_at) AS last_seen
  FROM window_events we
  GROUP BY we.user_id
),
per_user_songs AS (
  SELECT user_id, COUNT(*)::int AS song_plays
  FROM window_song_plays
  WHERE user_id IS NOT NULL
  GROUP BY user_id
),
per_user AS (
  SELECT
    COALESCE(pue.user_id, pus.user_id) AS user_id,
    COALESCE(pue.events, 0) AS events,
    COALESCE(pue.page_views, 0) AS page_views,
    COALESCE(pue.chat_messages, 0) AS chat_messages,
    COALESCE(pue.gallery_uploads, 0) AS gallery_uploads,
    COALESCE(pus.song_plays, 0) AS song_plays,
    pue.last_seen
  FROM per_user_events pue
  FULL OUTER JOIN per_user_songs pus ON pue.user_id = pus.user_id
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
    'song_plays', (SELECT COUNT(*) FROM window_song_plays),
    'eligible_users', (SELECT COUNT(*) FROM eligible)
  ),
  'users_breakdown', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        e.id,
        e.display_name,
        e.avatar_url,
        pu.events,
        pu.page_views,
        pu.chat_messages,
        pu.gallery_uploads,
        pu.song_plays,
        pu.last_seen
      FROM eligible e
      JOIN per_user pu ON pu.user_id = e.id
      WHERE pu.events > 0 OR pu.song_plays > 0
    ) t
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
