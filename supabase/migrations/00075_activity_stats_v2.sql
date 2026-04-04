-- Update activity_stats to include new event categories
CREATE OR REPLACE FUNCTION activity_stats(since_date timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'total_events', (SELECT count(*) FROM activity_log WHERE created_at >= since_date),
    'unique_users', (SELECT count(DISTINCT user_id) FROM activity_log WHERE created_at >= since_date),
    'logins', (SELECT count(*) FROM activity_log WHERE event_type = 'login' AND created_at >= since_date),
    'page_views', (SELECT count(*) FROM activity_log WHERE event_type = 'page_view' AND created_at >= since_date),
    'score_saves', (SELECT count(*) FROM activity_log WHERE event_type = 'score_save' AND created_at >= since_date),
    'chat_messages', (SELECT count(*) FROM activity_log WHERE event_type = 'chat_message' AND created_at >= since_date),
    'gallery_uploads', (SELECT count(*) FROM activity_log WHERE event_type = 'gallery_upload' AND created_at >= since_date),
    'notification_clicks', (SELECT count(*) FROM activity_log WHERE event_type = 'notification_click' AND created_at >= since_date),
    'errors', (SELECT count(*) FROM activity_log WHERE event_type = 'error' AND created_at >= since_date),
    'pickem_picks', (SELECT count(*) FROM activity_log WHERE event_type = 'pickem_pick' AND created_at >= since_date),
    'event_breakdown', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT event_type, count(*) as total
        FROM activity_log
        WHERE created_at >= since_date
        GROUP BY event_type
        ORDER BY total DESC
      ) t
    ),
    'top_pages', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT page_path, count(*) as views
        FROM activity_log
        WHERE event_type = 'page_view' AND created_at >= since_date AND page_path IS NOT NULL
        GROUP BY page_path
        ORDER BY views DESC
        LIMIT 10
      ) t
    ),
    'active_users', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT u.display_name, al.user_id, count(*) as events,
               max(al.created_at) as last_active
        FROM activity_log al
        JOIN users u ON u.id = al.user_id
        WHERE al.created_at >= since_date
        GROUP BY al.user_id, u.display_name
        ORDER BY events DESC
      ) t
    ),
    'daily_activity', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at)::date as day, count(*) as events
        FROM activity_log
        WHERE created_at >= since_date
        GROUP BY day
        ORDER BY day
      ) t
    ),
    'hourly_activity', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT extract(hour from created_at)::int as hour, count(*) as events
        FROM activity_log
        WHERE created_at >= since_date
        GROUP BY hour
        ORDER BY hour
      ) t
    ),
    'device_breakdown', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT
          CASE
            WHEN metadata->>'pwa' = 'true' THEN 'PWA'
            WHEN metadata->>'user_agent' ILIKE '%iphone%' THEN 'iPhone (Browser)'
            WHEN metadata->>'user_agent' ILIKE '%android%' THEN 'Android (Browser)'
            ELSE 'Desktop'
          END as device,
          count(DISTINCT user_id) as users
        FROM activity_log
        WHERE event_type = 'page_view' AND created_at >= since_date AND metadata->>'user_agent' IS NOT NULL
        GROUP BY device
        ORDER BY users DESC
      ) t
    )
  );
$$;
