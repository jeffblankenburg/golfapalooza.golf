-- Aggregated play and favorite counts for the Song Manager admin grid.
-- Replaces a client-side JS aggregation that was silently truncated by
-- PostgREST's 1000-row cap on .select() once song_plays grew past 1000 rows.

CREATE OR REPLACE FUNCTION song_play_counts()
RETURNS TABLE (song_id UUID, play_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT song_id, COUNT(*)::BIGINT AS play_count
  FROM song_plays
  GROUP BY song_id;
$$;

CREATE OR REPLACE FUNCTION song_favorite_counts()
RETURNS TABLE (song_id UUID, like_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT song_id, COUNT(*)::BIGINT AS like_count
  FROM song_favorites
  GROUP BY song_id;
$$;

GRANT EXECUTE ON FUNCTION song_play_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION song_favorite_counts() TO authenticated, service_role;
