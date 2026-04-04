-- Activity log for tracking user behavior (logins, page views, etc.)
DROP TABLE IF EXISTS public.activity_log;

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,          -- 'login', 'page_view', etc.
  page_path text,                     -- e.g. '/scoring', '/admin'
  metadata jsonb DEFAULT '{}',        -- extra context (user_agent, referrer, etc.)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by user and time
CREATE INDEX idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX idx_activity_log_created_at ON public.activity_log(created_at DESC);
CREATE INDEX idx_activity_log_event_type ON public.activity_log(event_type);

-- RLS: only service role inserts (via API), no direct user access
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Summary stats function for the analytics dashboard
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
    )
  );
$$;
