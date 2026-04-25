


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."activity_stats"("since_date" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
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


ALTER FUNCTION "public"."activity_stats"("since_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return exists (
    select 1 from public.users
    where id = auth.uid() and is_admin = true
  );
end;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_chat_room_member"("p_room_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_room_members
    WHERE room_id = p_room_id AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_chat_room_member"("p_room_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_message_room_member"("p_message_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_room_members crm
    JOIN public.chat_messages cm ON cm.room_id = crm.room_id
    WHERE cm.id = p_message_id AND crm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_message_room_member"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_round_creator"("p_round_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM rounds
    WHERE id = p_round_id AND created_by = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_round_creator"("p_round_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_round_player"("p_round_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM round_players
    WHERE round_id = p_round_id AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_round_player"("p_round_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_articles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_articles_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_songs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_songs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_round"("round_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM rounds r
    WHERE r.id = round_id AND r.created_by = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM round_players rp
    WHERE rp.round_id = round_id AND rp.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."user_can_access_round"("round_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accolades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "title" character varying(200) NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sort_order" smallint DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."accolades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."action_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "title" character varying(200) NOT NULL,
    "description" "text",
    "deadline" "date",
    "link" character varying(200),
    "sort_order" smallint DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."action_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "page_path" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "task" "text" NOT NULL,
    "model" "text" NOT NULL,
    "input_hash" "text",
    "input" "jsonb",
    "output" "jsonb",
    "confidence" "text",
    "found" boolean,
    "cost_usd" numeric(10,6),
    "latency_ms" integer,
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "error_message" "text",
    "committed" boolean DEFAULT false,
    "course_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_generations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."article_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."article_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "title" character varying(300) NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "featured_image_id" "uuid",
    "publish_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "featured_image_url" "text",
    "featured_image_source" character varying(20) DEFAULT 'gallery'::character varying,
    "featured_image_focal_x" smallint DEFAULT 50,
    "featured_image_focal_y" smallint DEFAULT 50,
    CONSTRAINT "articles_featured_image_source_check" CHECK ((("featured_image_source")::"text" = ANY ((ARRAY['gallery'::character varying, 'upload'::character varying, 'song_art'::character varying])::"text"[])))
);


ALTER TABLE "public"."articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."best_line_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "submitter_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "best_line_submissions_text_check" CHECK (("char_length"(TRIM(BOTH FROM "text")) > 0))
);


ALTER TABLE "public"."best_line_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."birthday_posts" (
    "user_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "room_id" "uuid" NOT NULL,
    "posted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."birthday_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broadcast_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "user_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."broadcast_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bspitw_bonus_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "hole_number" smallint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "on_green" boolean DEFAULT false,
    "holed_out" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bspitw_bonus_points_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18)))
);


ALTER TABLE "public"."bspitw_bonus_points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calcutta_buyer_paid" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "paid_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."calcutta_buyer_paid" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calcutta_ownership" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "share_pct" numeric(5,2) DEFAULT 100.00 NOT NULL,
    "amount_paid" numeric(10,2) DEFAULT 0 NOT NULL,
    "is_buyback" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."calcutta_ownership" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calcutta_prizes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "prize_name" character varying(100),
    "place" smallint DEFAULT 1 NOT NULL,
    "percentage" numeric(5,2) NOT NULL,
    "sort_order" smallint DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "linked_contest_id" "uuid",
    "per_player" boolean DEFAULT false NOT NULL,
    "player_count" smallint DEFAULT 1 NOT NULL,
    "resolution_type" character varying(30) DEFAULT NULL::character varying
);


ALTER TABLE "public"."calcutta_prizes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calcutta_winner_paid" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prize_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "paid_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."calcutta_winner_paid" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_hidden_messages" (
    "user_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_hidden_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text",
    "image_url" "text",
    "reply_to_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "content_or_image" CHECK ((("content" IS NOT NULL) OR ("image_url" IS NOT NULL)))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_read_receipts" (
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_message_id" "uuid",
    "last_read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_read_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_room_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "hidden_at" timestamp with time zone,
    CONSTRAINT "chat_room_members_role_check" CHECK (("role" = ANY (ARRAY['creator'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."chat_room_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "name" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "trip_id" "uuid",
    CONSTRAINT "chat_rooms_type_check" CHECK (("type" = ANY (ARRAY['group'::"text", 'dm'::"text"])))
);


ALTER TABLE "public"."chat_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."composition_tee_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tee_id" "uuid" NOT NULL,
    "hole_number" smallint NOT NULL,
    "source_tee_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "composition_tee_mappings_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18)))
);


ALTER TABLE "public"."composition_tee_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contest_hole_tees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "hole_number" smallint NOT NULL,
    "tee_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "handicap_index_override" smallint,
    CONSTRAINT "contest_hole_tees_handicap_override_range" CHECK ((("handicap_index_override" IS NULL) OR (("handicap_index_override" >= 1) AND ("handicap_index_override" <= 18)))),
    CONSTRAINT "contest_hole_tees_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18)))
);


ALTER TABLE "public"."contest_hole_tees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contest_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "auction_order" smallint,
    "bid_amount" numeric(10,2),
    "owner_id" "uuid",
    "sold_at" timestamp with time zone
);


ALTER TABLE "public"."contest_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contest_winners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prize_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "place" smallint DEFAULT 1 NOT NULL,
    "is_playoff" boolean DEFAULT false,
    "notes" "text",
    "resolved_at" timestamp with time zone DEFAULT "now"(),
    "resolved_by" "uuid"
);


ALTER TABLE "public"."contest_winners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "contest_type" character varying(50) NOT NULL,
    "day_number" smallint,
    "sort_order" smallint DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "calcutta_active_order" smallint,
    "scoring_closed_at" timestamp with time zone,
    "scoring_closed_by" "uuid",
    "verified_at" timestamp with time zone,
    "verified_by" "uuid",
    "winners_locked_at" timestamp with time zone,
    "winners_locked_by" "uuid",
    "scoring_opened_at" timestamp with time zone,
    "scoring_opened_by" "uuid"
);


ALTER TABLE "public"."contests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cornhole_bracket_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "bracket_type" "text" NOT NULL,
    "round_number" integer NOT NULL,
    "match_number" integer NOT NULL,
    "slot1_participant_id" "uuid",
    "slot2_participant_id" "uuid",
    "winner_participant_id" "uuid",
    "slot1_score" integer,
    "slot2_score" integer,
    "next_winner_match_id" "uuid",
    "next_winner_slot" integer,
    "next_loser_match_id" "uuid",
    "next_loser_slot" integer,
    "is_bye" boolean DEFAULT false,
    "seed1" integer,
    "seed2" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "series_best_of" integer,
    "slot1_wins" integer DEFAULT 0 NOT NULL,
    "slot2_wins" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "cornhole_bracket_matches_bracket_type_check" CHECK (("bracket_type" = ANY (ARRAY['main'::"text", 'winners'::"text", 'losers'::"text", 'championship'::"text"]))),
    CONSTRAINT "cornhole_bracket_matches_next_loser_slot_check" CHECK (("next_loser_slot" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "cornhole_bracket_matches_next_winner_slot_check" CHECK (("next_winner_slot" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."cornhole_bracket_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cornhole_team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cornhole_team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cornhole_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cornhole_teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_holes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "tee_id" "uuid" NOT NULL,
    "hole_number" integer NOT NULL,
    "par" integer NOT NULL,
    "handicap_index" integer NOT NULL,
    "yards" integer,
    "meters" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "overhead_image_url" "text",
    "green_image_url" "text",
    "tee_latitude" numeric(10,7),
    "tee_longitude" numeric(10,7),
    "green_latitude" numeric(10,7),
    "green_longitude" numeric(10,7),
    "drive_latitude" double precision,
    "drive_longitude" double precision,
    "green_front_latitude" double precision,
    "green_front_longitude" double precision,
    "green_back_latitude" double precision,
    "green_back_longitude" double precision,
    CONSTRAINT "course_holes_handicap_index_check" CHECK ((("handicap_index" >= 1) AND ("handicap_index" <= 18))),
    CONSTRAINT "course_holes_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18))),
    CONSTRAINT "course_holes_par_check" CHECK ((("par" >= 3) AND ("par" <= 6)))
);


ALTER TABLE "public"."course_holes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_tees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "tee_name" character varying(50) NOT NULL,
    "tee_color" character varying(20),
    "gender" character varying(10) DEFAULT 'all'::character varying,
    "course_rating" numeric(4,1),
    "slope_rating" integer,
    "front_nine_rating" numeric(4,1),
    "front_nine_slope" integer,
    "back_nine_rating" numeric(4,1),
    "back_nine_slope" integer,
    "total_yards" integer,
    "total_meters" integer,
    "par" integer DEFAULT 72 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "confidence" "jsonb",
    CONSTRAINT "course_tees_back_nine_slope_check" CHECK ((("back_nine_slope" >= 55) AND ("back_nine_slope" <= 155))),
    CONSTRAINT "course_tees_front_nine_slope_check" CHECK ((("front_nine_slope" >= 55) AND ("front_nine_slope" <= 155))),
    CONSTRAINT "course_tees_gender_check" CHECK ((("gender")::"text" = ANY ((ARRAY['men'::character varying, 'women'::character varying, 'all'::character varying])::"text"[]))),
    CONSTRAINT "course_tees_slope_rating_check" CHECK ((("slope_rating" IS NULL) OR (("slope_rating" >= 55) AND ("slope_rating" <= 155))))
);


ALTER TABLE "public"."course_tees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "external_id" character varying(100),
    "name" character varying(200) NOT NULL,
    "club_name" character varying(200),
    "address" character varying(300),
    "city" character varying(100),
    "state" character varying(50),
    "country" character varying(100) DEFAULT 'USA'::character varying,
    "postal_code" character varying(20),
    "phone" character varying(30),
    "website" character varying(300),
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "hole_count" integer DEFAULT 18,
    "cached_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "locked" boolean DEFAULT false NOT NULL,
    "lookup_key" "text",
    "source" "text" DEFAULT 'manual'::"text",
    "verified" boolean DEFAULT false,
    CONSTRAINT "courses_hole_count_check" CHECK (("hole_count" = ANY (ARRAY[9, 18]))),
    CONSTRAINT "courses_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'gcapi'::"text", 'ai'::"text"])))
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_contest_winners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "day_number" smallint NOT NULL,
    "contest_type" character varying(20) NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "daily_contest_winners_contest_type_check" CHECK ((("contest_type")::"text" = ANY ((ARRAY['ctp_front'::character varying, 'ctp_back'::character varying, 'long_drive'::character varying, 'long_putt'::character varying])::"text"[]))),
    CONSTRAINT "daily_contest_winners_day_number_check" CHECK (("day_number" >= 1))
);


ALTER TABLE "public"."daily_contest_winners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "day_number" smallint NOT NULL,
    "name" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."event_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "likelihood" smallint,
    "on_roster" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."event_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_player_handicaps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "handicap_index" numeric(4,1),
    "locked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."event_player_handicaps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "sort_order" smallint DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."facilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fake_ad_loozers" (
    "ad_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fake_ad_loozers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fake_ads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "image_url" "text" NOT NULL,
    "alt_text" "text",
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fake_ads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_contest_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "financial_contest_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "quantity" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."financial_contest_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_contests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(200) NOT NULL,
    "description" "text",
    "contest_date" "date",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "entry_fee" numeric(10,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."financial_contests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_transaction_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "action" character varying(10) NOT NULL,
    "changed_by" "uuid" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "previous_type" character varying(10),
    "previous_source" character varying(20),
    "previous_description" "text",
    "previous_amount" numeric(10,2),
    "previous_method" character varying(20),
    "previous_notes" "text",
    "previous_financial_contest_id" "uuid",
    "previous_trip_id" "uuid",
    CONSTRAINT "financial_transaction_history_action_check" CHECK ((("action")::"text" = ANY ((ARRAY['edit'::character varying, 'delete'::character varying])::"text"[])))
);


ALTER TABLE "public"."financial_transaction_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "trip_id" "uuid",
    "type" character varying(10) NOT NULL,
    "source" character varying(20) NOT NULL,
    "option_id" "uuid",
    "description" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "method" character varying(20),
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "financial_contest_id" "uuid",
    CONSTRAINT "financial_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "financial_transactions_source_check" CHECK ((("source")::"text" = ANY ((ARRAY['option'::character varying, 'manual'::character varying, 'adjustment'::character varying, 'contest_entry'::character varying, 'deposit'::character varying, 'withdrawal'::character varying, 'winnings'::character varying, 'credit'::character varying, 'expense'::character varying])::"text"[]))),
    CONSTRAINT "financial_transactions_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['charge'::character varying, 'payment'::character varying])::"text"[])))
);


ALTER TABLE "public"."financial_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gallery_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid",
    "uploader_id" "uuid" NOT NULL,
    "media_url" "text" NOT NULL,
    "thumbnail_url" "text",
    "media_type" "text" NOT NULL,
    "caption" "text",
    "width" smallint,
    "height" smallint,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "taken_at" timestamp with time zone,
    "sort_date" timestamp with time zone GENERATED ALWAYS AS (COALESCE("taken_at", "created_at")) STORED,
    CONSTRAINT "gallery_items_media_type_check" CHECK (("media_type" = ANY (ARRAY['photo'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."gallery_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gallery_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "tagged_user_id" "uuid" NOT NULL,
    "tagger_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gallery_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."handicap_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "handicap_index" numeric(3,1) NOT NULL,
    "rounds_used" integer NOT NULL,
    "differentials_used" "jsonb",
    "calculation_method" character varying(50),
    "effective_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."handicap_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hundred_feet_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "day_number" smallint NOT NULL,
    "feet" smallint DEFAULT 100 NOT NULL,
    "inches" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "hundred_feet_scores_day_number_check" CHECK (("day_number" >= 1)),
    CONSTRAINT "hundred_feet_scores_feet_check" CHECK ((("feet" >= 0) AND ("feet" <= 100))),
    CONSTRAINT "hundred_feet_scores_inches_check" CHECK ((("inches" >= 0) AND ("inches" <= 11)))
);


ALTER TABLE "public"."hundred_feet_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."itinerary_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "title" character varying(200) NOT NULL,
    "location" character varying(200),
    "day_number" smallint,
    "start_date" "date",
    "start_time" time without time zone,
    "end_date" "date",
    "end_time" time without time zone,
    "sort_order" smallint DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."itinerary_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kgb_cup_hole_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "foursome_id" "uuid" NOT NULL,
    "hole_number" smallint NOT NULL,
    "scorer_type" "text" NOT NULL,
    "scorer_id" "uuid" NOT NULL,
    "strokes" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "kgb_cup_hole_scores_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18))),
    CONSTRAINT "kgb_cup_hole_scores_scorer_type_check" CHECK (("scorer_type" = ANY (ARRAY['player'::"text", 'pair'::"text"]))),
    CONSTRAINT "kgb_cup_hole_scores_strokes_check" CHECK ((("strokes" >= 1) AND ("strokes" <= 20)))
);


ALTER TABLE "public"."kgb_cup_hole_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kgb_cup_pair_handicaps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "scramble_handicap" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kgb_cup_pair_handicaps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kgb_cup_player_handicaps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "original_handicap" numeric(4,1),
    "adjusted_handicap" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kgb_cup_player_handicaps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loozer_bios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_visible" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."loozer_bios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notebook_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_system" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."notebook_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notebook_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "title" character varying(200) NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "pinned_to" character varying(50) DEFAULT NULL::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notebook_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."option_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "icon" character varying(50)
);


ALTER TABLE "public"."option_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pickem_games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "away_team" "text" NOT NULL,
    "home_team" "text" NOT NULL,
    "away_logo_url" "text",
    "home_logo_url" "text",
    "spread" numeric(4,1) DEFAULT 0 NOT NULL,
    "favorite" "text" NOT NULL,
    "game_time" timestamp with time zone NOT NULL,
    "tv_channel" "text",
    "is_tiebreaker" boolean DEFAULT false NOT NULL,
    "winning_team" "text",
    "away_score" smallint,
    "home_score" smallint,
    "sort_order" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "away_color" "text",
    "home_color" "text",
    CONSTRAINT "pickem_games_favorite_check" CHECK (("favorite" = ANY (ARRAY['away'::"text", 'home'::"text"]))),
    CONSTRAINT "pickem_games_winning_team_check" CHECK (("winning_team" = ANY (ARRAY['away'::"text", 'home'::"text"])))
);


ALTER TABLE "public"."pickem_games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pickem_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "paid" boolean DEFAULT false NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pickem_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pickem_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "paid_out" boolean DEFAULT false NOT NULL,
    "paid_out_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pickem_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pickem_picks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "picked_team" "text" NOT NULL,
    "tiebreaker_total" smallint,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pickem_picks_picked_team_check" CHECK (("picked_team" = ANY (ARRAY['away'::"text", 'home'::"text"])))
);


ALTER TABLE "public"."pickem_picks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pickem_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "entry_fee" numeric(8,2) DEFAULT 0,
    "payout_json" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_open" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."pickem_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_handicaps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "handicap_index" numeric(3,1),
    "low_handicap_index" numeric(3,1),
    "rounds_used" integer DEFAULT 0,
    "last_calculated_at" timestamp with time zone,
    "effective_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."player_handicaps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rookie_nominations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nominator_id" "uuid" NOT NULL,
    "phone" character varying(15) NOT NULL,
    "first_name" character varying(100) NOT NULL,
    "last_name" character varying(100) NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "invite_message" "text"
);


ALTER TABLE "public"."rookie_nominations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "trip_id" "uuid"
);


ALTER TABLE "public"."room_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_number" character varying(20) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "facility_id" "uuid",
    "smoking" boolean DEFAULT false,
    "showers" smallint DEFAULT 1,
    "bed_type" character varying(30) DEFAULT 'Double'::character varying,
    "handicapped" boolean DEFAULT false NOT NULL,
    "pet_friendly" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."round_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tee_id" "uuid" NOT NULL,
    "player_position" integer NOT NULL,
    "is_scorer" boolean DEFAULT false,
    "playing_handicap" integer,
    "final_gross_score" integer,
    "final_adjusted_score" integer,
    "final_net_score" integer,
    "score_differential" numeric(4,1),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "round_players_player_position_check" CHECK ((("player_position" >= 1) AND ("player_position" <= 4)))
);


ALTER TABLE "public"."round_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."round_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "round_player_id" "uuid" NOT NULL,
    "hole_number" integer NOT NULL,
    "strokes" integer,
    "putts" integer,
    "fairway_hit" boolean,
    "green_in_regulation" boolean,
    "penalty_strokes" integer DEFAULT 0,
    "notes" character varying(200),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "round_scores_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18))),
    CONSTRAINT "round_scores_putts_check" CHECK ((("putts" >= 0) AND ("putts" <= 10))),
    CONSTRAINT "round_scores_strokes_check" CHECK ((("strokes" >= 1) AND ("strokes" <= 20)))
);


ALTER TABLE "public"."round_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "tee_id" "uuid" NOT NULL,
    "round_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "round_type" character varying(10) DEFAULT '18'::character varying NOT NULL,
    "status" character varying(20) DEFAULT 'in_progress'::character varying NOT NULL,
    "weather_conditions" character varying(100),
    "notes" "text",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "rounds_round_type_check" CHECK ((("round_type")::"text" = ANY ((ARRAY['9-front'::character varying, '9-back'::character varying, '18'::character varying])::"text"[]))),
    CONSTRAINT "rounds_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['in_progress'::character varying, 'completed'::character varying, 'abandoned'::character varying])::"text"[])))
);


ALTER TABLE "public"."rounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ryder_cup_pairs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_a_id" "uuid",
    "player_b_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ryder_cup_pairs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ryder_cup_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "team_number" integer NOT NULL,
    "team_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_color" "text",
    CONSTRAINT "ryder_cup_teams_team_number_check" CHECK (("team_number" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."ryder_cup_teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scheduled_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "audience_type" "text" NOT NULL,
    "audience_user_ids" "jsonb",
    "trip_id" "uuid",
    "scheduled_for" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sent_at" timestamp with time zone,
    CONSTRAINT "scheduled_announcements_audience_type_check" CHECK (("audience_type" = ANY (ARRAY['everyone'::"text", 'event'::"text", 'custom'::"text"]))),
    CONSTRAINT "scheduled_announcements_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."scheduled_announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scramble_hole_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "hole_number" smallint NOT NULL,
    "strokes" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "scramble_hole_scores_hole_number_check" CHECK ((("hole_number" >= 1) AND ("hole_number" <= 18))),
    CONSTRAINT "scramble_hole_scores_strokes_check" CHECK ((("strokes" >= 1) AND ("strokes" <= 20)))
);


ALTER TABLE "public"."scramble_hole_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scramble_team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."scramble_team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scramble_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "team_handicap" integer DEFAULT 0,
    "gross_score" integer,
    "course_par" integer DEFAULT 72 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "verified_at" timestamp with time zone,
    "verified_by" "uuid"
);


ALTER TABLE "public"."scramble_teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."song_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "song_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."song_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."song_plays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "song_id" "uuid" NOT NULL,
    "played_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."song_plays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."songs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "mp3_url" "text" NOT NULL,
    "art_url" "text",
    "lyrics" "text",
    "duration_seconds" smallint,
    "tagged_user_id" "uuid",
    "sort_order" smallint DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "art_thumb_url" "text"
);


ALTER TABLE "public"."songs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tee_time_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tee_time_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tee_time_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tee_time_reminders_sent" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tee_time_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tee_time_reminders_sent" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tee_times" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "day_number" smallint NOT NULL,
    "tee_time" time without time zone,
    "starting_hole" smallint DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "scramble_team_id" "uuid"
);


ALTER TABLE "public"."tee_times" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_facilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "facility_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trip_facilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_option_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "selection_deadline" timestamp with time zone,
    "is_open" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trip_option_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "name" character varying(200) NOT NULL,
    "description" "text",
    "option_type" character varying(20) NOT NULL,
    "choices" "jsonb",
    "cost" numeric(10,2),
    "is_required" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "icon" character varying(50),
    "linked_contest_id" "uuid",
    "depends_on_option_id" "uuid",
    CONSTRAINT "trip_options_option_type_check" CHECK ((("option_type")::"text" = ANY ((ARRAY['checkbox'::character varying, 'select'::character varying, 'multi_select'::character varying, 'text'::character varying, 'number'::character varying])::"text"[])))
);


ALTER TABLE "public"."trip_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_name" character varying(100) DEFAULT 'Golfapalooza'::character varying NOT NULL,
    "trip_year" smallint NOT NULL,
    "start_date" "date" NOT NULL,
    "location" character varying(200),
    "hotel_name" character varying(200),
    "hotel_address" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" character varying(20) DEFAULT 'active'::character varying,
    "course_id" "uuid",
    "show_tee_times" boolean DEFAULT false NOT NULL,
    "show_teams" boolean DEFAULT false NOT NULL,
    "show_rooms" boolean DEFAULT false NOT NULL,
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "sim_date" "text",
    "tee_time_reminder_minutes" smallint DEFAULT 30 NOT NULL,
    "visibility_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."trip_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_action_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "action_item_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_action_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_option_selections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "option_id" "uuid" NOT NULL,
    "value" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_option_selections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_scramble_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "eight_bag_average" numeric(4,1),
    "avg_scramble_score" numeric(4,1),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_scramble_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "phone" character varying(15),
    "display_name" character varying(100) NOT NULL,
    "full_name" character varying(100),
    "is_admin" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "email" character varying(255),
    "onboarding_completed" boolean DEFAULT false,
    "avatar_url" "text",
    "birthday" "date",
    "occupation" character varying(100),
    "city" character varying(100),
    "state" character varying(2),
    "playing_since" smallint,
    "swings" character varying(10),
    "typical_shot" character varying(20),
    "shirt_size" character varying(5),
    "fun_fact" "text",
    "best_shot" "text",
    "permissions" "jsonb" DEFAULT '{}'::"jsonb",
    "eight_bag_average" numeric(4,1),
    "avg_scramble_score" numeric(4,1),
    "is_financial_only" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accolades"
    ADD CONSTRAINT "accolades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_generations"
    ADD CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."article_views"
    ADD CONSTRAINT "article_views_article_id_user_id_key" UNIQUE ("article_id", "user_id");



ALTER TABLE ONLY "public"."article_views"
    ADD CONSTRAINT "article_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."best_line_submissions"
    ADD CONSTRAINT "best_line_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."birthday_posts"
    ADD CONSTRAINT "birthday_posts_pkey" PRIMARY KEY ("user_id", "year", "room_id");



ALTER TABLE ONLY "public"."broadcast_lists"
    ADD CONSTRAINT "broadcast_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bspitw_bonus_points"
    ADD CONSTRAINT "bspitw_bonus_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bspitw_bonus_points"
    ADD CONSTRAINT "bspitw_bonus_points_team_id_hole_number_user_id_key" UNIQUE ("team_id", "hole_number", "user_id");



ALTER TABLE ONLY "public"."calcutta_buyer_paid"
    ADD CONSTRAINT "calcutta_buyer_paid_contest_id_user_id_key" UNIQUE ("contest_id", "user_id");



ALTER TABLE ONLY "public"."calcutta_buyer_paid"
    ADD CONSTRAINT "calcutta_buyer_paid_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calcutta_ownership"
    ADD CONSTRAINT "calcutta_ownership_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calcutta_prizes"
    ADD CONSTRAINT "calcutta_prizes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calcutta_winner_paid"
    ADD CONSTRAINT "calcutta_winner_paid_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calcutta_winner_paid"
    ADD CONSTRAINT "calcutta_winner_paid_prize_id_owner_id_key" UNIQUE ("prize_id", "owner_id");



ALTER TABLE ONLY "public"."chat_hidden_messages"
    ADD CONSTRAINT "chat_hidden_messages_pkey" PRIMARY KEY ("user_id", "message_id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_reactions"
    ADD CONSTRAINT "chat_reactions_message_id_user_id_emoji_key" UNIQUE ("message_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."chat_reactions"
    ADD CONSTRAINT "chat_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_read_receipts"
    ADD CONSTRAINT "chat_read_receipts_pkey" PRIMARY KEY ("room_id", "user_id");



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_room_id_user_id_key" UNIQUE ("room_id", "user_id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."composition_tee_mappings"
    ADD CONSTRAINT "composition_tee_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."composition_tee_mappings"
    ADD CONSTRAINT "composition_tee_mappings_tee_id_hole_number_key" UNIQUE ("tee_id", "hole_number");



ALTER TABLE ONLY "public"."contest_hole_tees"
    ADD CONSTRAINT "contest_hole_tees_contest_id_hole_number_key" UNIQUE ("contest_id", "hole_number");



ALTER TABLE ONLY "public"."contest_hole_tees"
    ADD CONSTRAINT "contest_hole_tees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contest_participants"
    ADD CONSTRAINT "contest_participants_contest_id_user_id_key" UNIQUE ("contest_id", "user_id");



ALTER TABLE ONLY "public"."contest_participants"
    ADD CONSTRAINT "contest_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contest_winners"
    ADD CONSTRAINT "contest_winners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contest_winners"
    ADD CONSTRAINT "contest_winners_prize_id_user_id_key" UNIQUE ("prize_id", "user_id");



ALTER TABLE ONLY "public"."contests"
    ADD CONSTRAINT "contests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cornhole_bracket_matches"
    ADD CONSTRAINT "cornhole_bracket_matches_contest_id_bracket_type_round_numb_key" UNIQUE ("contest_id", "bracket_type", "round_number", "match_number");



ALTER TABLE ONLY "public"."cornhole_bracket_matches"
    ADD CONSTRAINT "cornhole_bracket_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cornhole_team_members"
    ADD CONSTRAINT "cornhole_team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cornhole_team_members"
    ADD CONSTRAINT "cornhole_team_members_team_id_user_id_key" UNIQUE ("team_id", "user_id");



ALTER TABLE ONLY "public"."cornhole_teams"
    ADD CONSTRAINT "cornhole_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_holes"
    ADD CONSTRAINT "course_holes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_holes"
    ADD CONSTRAINT "course_holes_tee_id_hole_number_key" UNIQUE ("tee_id", "hole_number");



ALTER TABLE ONLY "public"."course_tees"
    ADD CONSTRAINT "course_tees_course_id_tee_name_gender_key" UNIQUE ("course_id", "tee_name", "gender");



ALTER TABLE ONLY "public"."course_tees"
    ADD CONSTRAINT "course_tees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_contest_winners"
    ADD CONSTRAINT "daily_contest_winners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_contest_winners"
    ADD CONSTRAINT "daily_contest_winners_trip_id_day_number_contest_type_key" UNIQUE ("trip_id", "day_number", "contest_type");



ALTER TABLE ONLY "public"."event_days"
    ADD CONSTRAINT "event_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_days"
    ADD CONSTRAINT "event_days_trip_id_day_number_key" UNIQUE ("trip_id", "day_number");



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_trip_id_user_id_key" UNIQUE ("trip_id", "user_id");



ALTER TABLE ONLY "public"."event_player_handicaps"
    ADD CONSTRAINT "event_player_handicaps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_player_handicaps"
    ADD CONSTRAINT "event_player_handicaps_trip_id_user_id_key" UNIQUE ("trip_id", "user_id");



ALTER TABLE ONLY "public"."facilities"
    ADD CONSTRAINT "facilities_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."facilities"
    ADD CONSTRAINT "facilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fake_ad_loozers"
    ADD CONSTRAINT "fake_ad_loozers_pkey" PRIMARY KEY ("ad_id", "user_id");



ALTER TABLE ONLY "public"."fake_ads"
    ADD CONSTRAINT "fake_ads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_contest_participants"
    ADD CONSTRAINT "financial_contest_participants_financial_contest_id_user_id_key" UNIQUE ("financial_contest_id", "user_id");



ALTER TABLE ONLY "public"."financial_contest_participants"
    ADD CONSTRAINT "financial_contest_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_contests"
    ADD CONSTRAINT "financial_contests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_transaction_history"
    ADD CONSTRAINT "financial_transaction_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_comments"
    ADD CONSTRAINT "gallery_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_items"
    ADD CONSTRAINT "gallery_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_reactions"
    ADD CONSTRAINT "gallery_reactions_item_id_user_id_emoji_key" UNIQUE ("item_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."gallery_reactions"
    ADD CONSTRAINT "gallery_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_tags"
    ADD CONSTRAINT "gallery_tags_item_id_tagged_user_id_key" UNIQUE ("item_id", "tagged_user_id");



ALTER TABLE ONLY "public"."gallery_tags"
    ADD CONSTRAINT "gallery_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."handicap_history"
    ADD CONSTRAINT "handicap_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hundred_feet_scores"
    ADD CONSTRAINT "hundred_feet_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hundred_feet_scores"
    ADD CONSTRAINT "hundred_feet_scores_trip_id_user_id_day_number_key" UNIQUE ("trip_id", "user_id", "day_number");



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kgb_cup_hole_scores"
    ADD CONSTRAINT "kgb_cup_hole_scores_foursome_id_hole_number_scorer_type_sco_key" UNIQUE ("foursome_id", "hole_number", "scorer_type", "scorer_id");



ALTER TABLE ONLY "public"."kgb_cup_hole_scores"
    ADD CONSTRAINT "kgb_cup_hole_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kgb_cup_pair_handicaps"
    ADD CONSTRAINT "kgb_cup_pair_handicaps_contest_id_pair_id_key" UNIQUE ("contest_id", "pair_id");



ALTER TABLE ONLY "public"."kgb_cup_pair_handicaps"
    ADD CONSTRAINT "kgb_cup_pair_handicaps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kgb_cup_player_handicaps"
    ADD CONSTRAINT "kgb_cup_player_handicaps_contest_id_player_id_key" UNIQUE ("contest_id", "player_id");



ALTER TABLE ONLY "public"."kgb_cup_player_handicaps"
    ADD CONSTRAINT "kgb_cup_player_handicaps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loozer_bios"
    ADD CONSTRAINT "loozer_bios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loozer_bios"
    ADD CONSTRAINT "loozer_bios_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."notebook_categories"
    ADD CONSTRAINT "notebook_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notebook_notes"
    ADD CONSTRAINT "notebook_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."option_groups"
    ADD CONSTRAINT "option_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pickem_games"
    ADD CONSTRAINT "pickem_games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pickem_payments"
    ADD CONSTRAINT "pickem_payments_contest_id_user_id_key" UNIQUE ("contest_id", "user_id");



ALTER TABLE ONLY "public"."pickem_payments"
    ADD CONSTRAINT "pickem_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pickem_payouts"
    ADD CONSTRAINT "pickem_payouts_contest_id_user_id_key" UNIQUE ("contest_id", "user_id");



ALTER TABLE ONLY "public"."pickem_payouts"
    ADD CONSTRAINT "pickem_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pickem_picks"
    ADD CONSTRAINT "pickem_picks_game_id_user_id_key" UNIQUE ("game_id", "user_id");



ALTER TABLE ONLY "public"."pickem_picks"
    ADD CONSTRAINT "pickem_picks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pickem_settings"
    ADD CONSTRAINT "pickem_settings_contest_id_key" UNIQUE ("contest_id");



ALTER TABLE ONLY "public"."pickem_settings"
    ADD CONSTRAINT "pickem_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_handicaps"
    ADD CONSTRAINT "player_handicaps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_handicaps"
    ADD CONSTRAINT "player_handicaps_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."rookie_nominations"
    ADD CONSTRAINT "rookie_nominations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_assignments"
    ADD CONSTRAINT "room_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_assignments"
    ADD CONSTRAINT "room_assignments_trip_room_user_key" UNIQUE ("trip_id", "room_id", "user_id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_facility_id_room_number_key" UNIQUE ("facility_id", "room_number");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."round_players"
    ADD CONSTRAINT "round_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."round_players"
    ADD CONSTRAINT "round_players_round_id_player_position_key" UNIQUE ("round_id", "player_position");



ALTER TABLE ONLY "public"."round_players"
    ADD CONSTRAINT "round_players_round_id_user_id_key" UNIQUE ("round_id", "user_id");



ALTER TABLE ONLY "public"."round_scores"
    ADD CONSTRAINT "round_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."round_scores"
    ADD CONSTRAINT "round_scores_round_player_id_hole_number_key" UNIQUE ("round_player_id", "hole_number");



ALTER TABLE ONLY "public"."rounds"
    ADD CONSTRAINT "rounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ryder_cup_pairs"
    ADD CONSTRAINT "ryder_cup_pairs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ryder_cup_teams"
    ADD CONSTRAINT "ryder_cup_teams_contest_id_team_number_key" UNIQUE ("contest_id", "team_number");



ALTER TABLE ONLY "public"."ryder_cup_teams"
    ADD CONSTRAINT "ryder_cup_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_announcements"
    ADD CONSTRAINT "scheduled_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scramble_hole_scores"
    ADD CONSTRAINT "scramble_hole_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scramble_hole_scores"
    ADD CONSTRAINT "scramble_hole_scores_team_id_hole_number_key" UNIQUE ("team_id", "hole_number");



ALTER TABLE ONLY "public"."scramble_team_members"
    ADD CONSTRAINT "scramble_team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scramble_team_members"
    ADD CONSTRAINT "scramble_team_members_team_id_user_id_key" UNIQUE ("team_id", "user_id");



ALTER TABLE ONLY "public"."scramble_teams"
    ADD CONSTRAINT "scramble_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."song_favorites"
    ADD CONSTRAINT "song_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."song_favorites"
    ADD CONSTRAINT "song_favorites_user_id_song_id_key" UNIQUE ("user_id", "song_id");



ALTER TABLE ONLY "public"."song_plays"
    ADD CONSTRAINT "song_plays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."songs"
    ADD CONSTRAINT "songs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tee_time_players"
    ADD CONSTRAINT "tee_time_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tee_time_players"
    ADD CONSTRAINT "tee_time_players_tee_time_id_user_id_key" UNIQUE ("tee_time_id", "user_id");



ALTER TABLE ONLY "public"."tee_time_reminders_sent"
    ADD CONSTRAINT "tee_time_reminders_sent_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tee_time_reminders_sent"
    ADD CONSTRAINT "tee_time_reminders_sent_tee_time_id_user_id_key" UNIQUE ("tee_time_id", "user_id");



ALTER TABLE ONLY "public"."tee_times"
    ADD CONSTRAINT "tee_times_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_facilities"
    ADD CONSTRAINT "trip_facilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_facilities"
    ADD CONSTRAINT "trip_facilities_trip_id_facility_id_key" UNIQUE ("trip_id", "facility_id");



ALTER TABLE ONLY "public"."trip_option_settings"
    ADD CONSTRAINT "trip_option_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_option_settings"
    ADD CONSTRAINT "trip_option_settings_trip_id_key" UNIQUE ("trip_id");



ALTER TABLE ONLY "public"."trip_options"
    ADD CONSTRAINT "trip_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_settings"
    ADD CONSTRAINT "trip_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_action_completions"
    ADD CONSTRAINT "user_action_completions_action_item_id_user_id_key" UNIQUE ("action_item_id", "user_id");



ALTER TABLE ONLY "public"."user_action_completions"
    ADD CONSTRAINT "user_action_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_option_selections"
    ADD CONSTRAINT "user_option_selections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_option_selections"
    ADD CONSTRAINT "user_option_selections_user_id_option_id_key" UNIQUE ("user_id", "option_id");



ALTER TABLE ONLY "public"."user_scramble_stats"
    ADD CONSTRAINT "user_scramble_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_scramble_stats"
    ADD CONSTRAINT "user_scramble_stats_user_id_trip_id_key" UNIQUE ("user_id", "trip_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_activity_log_created_at" ON "public"."activity_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activity_log_event_type" ON "public"."activity_log" USING "btree" ("event_type");



CREATE INDEX "idx_activity_log_user_id" ON "public"."activity_log" USING "btree" ("user_id");



CREATE INDEX "idx_ai_generations_course" ON "public"."ai_generations" USING "btree" ("course_id");



CREATE INDEX "idx_ai_generations_task" ON "public"."ai_generations" USING "btree" ("task");



CREATE INDEX "idx_ai_generations_user_created" ON "public"."ai_generations" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_article_views_article" ON "public"."article_views" USING "btree" ("article_id");



CREATE INDEX "idx_articles_trip_publish" ON "public"."articles" USING "btree" ("trip_id", "publish_at" DESC NULLS LAST);



CREATE INDEX "idx_best_line_submissions_trip" ON "public"."best_line_submissions" USING "btree" ("trip_id", "created_at" DESC);



CREATE INDEX "idx_best_line_submissions_user" ON "public"."best_line_submissions" USING "btree" ("submitter_id", "created_at" DESC);



CREATE INDEX "idx_bracket_matches_contest" ON "public"."cornhole_bracket_matches" USING "btree" ("contest_id");



CREATE INDEX "idx_bspitw_bonus_points_team" ON "public"."bspitw_bonus_points" USING "btree" ("team_id");



CREATE INDEX "idx_bspitw_bonus_points_user" ON "public"."bspitw_bonus_points" USING "btree" ("user_id");



CREATE INDEX "idx_chat_hidden_messages_user" ON "public"."chat_hidden_messages" USING "btree" ("user_id");



CREATE INDEX "idx_chat_messages_room_created" ON "public"."chat_messages" USING "btree" ("room_id", "created_at" DESC);



CREATE INDEX "idx_chat_reactions_message" ON "public"."chat_reactions" USING "btree" ("message_id");



CREATE INDEX "idx_chat_room_members_room" ON "public"."chat_room_members" USING "btree" ("room_id");



CREATE INDEX "idx_chat_room_members_user" ON "public"."chat_room_members" USING "btree" ("user_id");



CREATE INDEX "idx_composition_tee_mappings_tee" ON "public"."composition_tee_mappings" USING "btree" ("tee_id");



CREATE INDEX "idx_contest_hole_tees_contest_id" ON "public"."contest_hole_tees" USING "btree" ("contest_id");



CREATE INDEX "idx_contest_hole_tees_tee_id" ON "public"."contest_hole_tees" USING "btree" ("tee_id");



CREATE INDEX "idx_contest_winners_prize_id" ON "public"."contest_winners" USING "btree" ("prize_id");



CREATE INDEX "idx_contest_winners_user_id" ON "public"."contest_winners" USING "btree" ("user_id");



CREATE INDEX "idx_cornhole_team_members_team" ON "public"."cornhole_team_members" USING "btree" ("team_id");



CREATE INDEX "idx_cornhole_team_members_user" ON "public"."cornhole_team_members" USING "btree" ("user_id");



CREATE INDEX "idx_cornhole_teams_contest" ON "public"."cornhole_teams" USING "btree" ("contest_id");



CREATE INDEX "idx_course_holes_course" ON "public"."course_holes" USING "btree" ("course_id");



CREATE INDEX "idx_course_holes_tee" ON "public"."course_holes" USING "btree" ("tee_id");



CREATE INDEX "idx_course_tees_course" ON "public"."course_tees" USING "btree" ("course_id");



CREATE INDEX "idx_courses_external_id" ON "public"."courses" USING "btree" ("external_id");



CREATE INDEX "idx_courses_location" ON "public"."courses" USING "btree" ("city", "state");



CREATE UNIQUE INDEX "idx_courses_lookup_key" ON "public"."courses" USING "btree" ("lookup_key") WHERE ("lookup_key" IS NOT NULL);



CREATE INDEX "idx_courses_name" ON "public"."courses" USING "btree" ("name");



CREATE INDEX "idx_event_days_trip" ON "public"."event_days" USING "btree" ("trip_id", "day_number");



CREATE INDEX "idx_event_player_handicaps_trip" ON "public"."event_player_handicaps" USING "btree" ("trip_id");



CREATE INDEX "idx_fake_ad_loozers_user" ON "public"."fake_ad_loozers" USING "btree" ("user_id");



CREATE INDEX "idx_fake_ads_active" ON "public"."fake_ads" USING "btree" ("active");



CREATE INDEX "idx_fcp_contest" ON "public"."financial_contest_participants" USING "btree" ("financial_contest_id");



CREATE INDEX "idx_fcp_user" ON "public"."financial_contest_participants" USING "btree" ("user_id");



CREATE INDEX "idx_financial_contests_date" ON "public"."financial_contests" USING "btree" ("contest_date" DESC NULLS LAST);



CREATE INDEX "idx_financial_transactions_contest" ON "public"."financial_transactions" USING "btree" ("financial_contest_id") WHERE ("financial_contest_id" IS NOT NULL);



CREATE INDEX "idx_financial_transactions_option" ON "public"."financial_transactions" USING "btree" ("option_id") WHERE ("option_id" IS NOT NULL);



CREATE INDEX "idx_financial_transactions_trip" ON "public"."financial_transactions" USING "btree" ("trip_id");



CREATE INDEX "idx_financial_transactions_user" ON "public"."financial_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_fth_changed_by" ON "public"."financial_transaction_history" USING "btree" ("changed_by");



CREATE INDEX "idx_fth_transaction" ON "public"."financial_transaction_history" USING "btree" ("transaction_id");



CREATE INDEX "idx_gallery_comments_item_created" ON "public"."gallery_comments" USING "btree" ("item_id", "created_at");



CREATE INDEX "idx_gallery_items_sort_date" ON "public"."gallery_items" USING "btree" ("sort_date" DESC);



CREATE INDEX "idx_gallery_items_trip_created" ON "public"."gallery_items" USING "btree" ("trip_id", "created_at" DESC);



CREATE INDEX "idx_gallery_items_uploader" ON "public"."gallery_items" USING "btree" ("uploader_id");



CREATE INDEX "idx_gallery_reactions_item" ON "public"."gallery_reactions" USING "btree" ("item_id");



CREATE INDEX "idx_gallery_tags_item" ON "public"."gallery_tags" USING "btree" ("item_id");



CREATE INDEX "idx_gallery_tags_user" ON "public"."gallery_tags" USING "btree" ("tagged_user_id");



CREATE INDEX "idx_handicap_history_date" ON "public"."handicap_history" USING "btree" ("effective_date" DESC);



CREATE INDEX "idx_handicap_history_user" ON "public"."handicap_history" USING "btree" ("user_id");



CREATE INDEX "idx_kgb_cup_hole_scores_foursome" ON "public"."kgb_cup_hole_scores" USING "btree" ("foursome_id");



CREATE INDEX "idx_kgb_cup_pair_handicaps_contest" ON "public"."kgb_cup_pair_handicaps" USING "btree" ("contest_id");



CREATE INDEX "idx_kgb_cup_player_handicaps_contest" ON "public"."kgb_cup_player_handicaps" USING "btree" ("contest_id");



CREATE UNIQUE INDEX "idx_nominations_pending_phone" ON "public"."rookie_nominations" USING "btree" ("phone") WHERE (("status")::"text" = 'pending'::"text");



CREATE INDEX "idx_notebook_categories_trip" ON "public"."notebook_categories" USING "btree" ("trip_id");



CREATE INDEX "idx_notebook_notes_category" ON "public"."notebook_notes" USING "btree" ("category_id");



CREATE INDEX "idx_notebook_notes_pinned" ON "public"."notebook_notes" USING "btree" ("pinned_to");



CREATE UNIQUE INDEX "idx_notebook_notes_pinned_unique" ON "public"."notebook_notes" USING "btree" ("trip_id", "pinned_to") WHERE ("pinned_to" IS NOT NULL);



CREATE INDEX "idx_notebook_notes_trip" ON "public"."notebook_notes" USING "btree" ("trip_id");



CREATE INDEX "idx_notifications_user_read_created" ON "public"."notifications" USING "btree" ("user_id", "read", "created_at" DESC);



CREATE INDEX "idx_option_groups_trip" ON "public"."option_groups" USING "btree" ("trip_id");



CREATE INDEX "idx_pickem_games_contest" ON "public"."pickem_games" USING "btree" ("contest_id");



CREATE INDEX "idx_pickem_payouts_contest" ON "public"."pickem_payouts" USING "btree" ("contest_id");



CREATE INDEX "idx_pickem_picks_game" ON "public"."pickem_picks" USING "btree" ("game_id");



CREATE INDEX "idx_pickem_picks_user" ON "public"."pickem_picks" USING "btree" ("user_id");



CREATE INDEX "idx_player_handicaps_user" ON "public"."player_handicaps" USING "btree" ("user_id");



CREATE INDEX "idx_round_players_round" ON "public"."round_players" USING "btree" ("round_id");



CREATE INDEX "idx_round_players_user" ON "public"."round_players" USING "btree" ("user_id");



CREATE INDEX "idx_round_scores_player" ON "public"."round_scores" USING "btree" ("round_player_id");



CREATE INDEX "idx_round_scores_round" ON "public"."round_scores" USING "btree" ("round_id");



CREATE INDEX "idx_rounds_created_by" ON "public"."rounds" USING "btree" ("created_by");



CREATE INDEX "idx_rounds_date" ON "public"."rounds" USING "btree" ("round_date" DESC);



CREATE INDEX "idx_rounds_status" ON "public"."rounds" USING "btree" ("status");



CREATE INDEX "idx_ryder_cup_pairs_team" ON "public"."ryder_cup_pairs" USING "btree" ("team_id");



CREATE INDEX "idx_ryder_cup_teams_contest" ON "public"."ryder_cup_teams" USING "btree" ("contest_id");



CREATE INDEX "idx_scheduled_announcements_pending" ON "public"."scheduled_announcements" USING "btree" ("status", "scheduled_for") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_scramble_hole_scores_team" ON "public"."scramble_hole_scores" USING "btree" ("team_id");



CREATE INDEX "idx_scramble_team_members_team" ON "public"."scramble_team_members" USING "btree" ("team_id");



CREATE INDEX "idx_scramble_team_members_user" ON "public"."scramble_team_members" USING "btree" ("user_id");



CREATE INDEX "idx_scramble_teams_contest" ON "public"."scramble_teams" USING "btree" ("contest_id");



CREATE INDEX "idx_song_favorites_song" ON "public"."song_favorites" USING "btree" ("song_id");



CREATE INDEX "idx_song_favorites_user" ON "public"."song_favorites" USING "btree" ("user_id");



CREATE INDEX "idx_song_plays_song" ON "public"."song_plays" USING "btree" ("song_id");



CREATE INDEX "idx_song_plays_user" ON "public"."song_plays" USING "btree" ("user_id");



CREATE INDEX "idx_songs_sort_order" ON "public"."songs" USING "btree" ("sort_order");



CREATE INDEX "idx_songs_tagged_user" ON "public"."songs" USING "btree" ("tagged_user_id");



CREATE INDEX "idx_tee_time_players_tee_time" ON "public"."tee_time_players" USING "btree" ("tee_time_id");



CREATE INDEX "idx_tee_time_players_user" ON "public"."tee_time_players" USING "btree" ("user_id");



CREATE INDEX "idx_tee_time_reminders_sent_tee_time" ON "public"."tee_time_reminders_sent" USING "btree" ("tee_time_id");



CREATE INDEX "idx_tee_times_scramble_team" ON "public"."tee_times" USING "btree" ("scramble_team_id");



CREATE INDEX "idx_tee_times_trip_day" ON "public"."tee_times" USING "btree" ("trip_id", "day_number");



CREATE INDEX "idx_trip_options_depends_on" ON "public"."trip_options" USING "btree" ("depends_on_option_id") WHERE ("depends_on_option_id" IS NOT NULL);



CREATE INDEX "idx_trip_options_group" ON "public"."trip_options" USING "btree" ("group_id");



CREATE INDEX "idx_trip_options_trip" ON "public"."trip_options" USING "btree" ("trip_id");



CREATE INDEX "idx_user_option_selections_option" ON "public"."user_option_selections" USING "btree" ("option_id");



CREATE INDEX "idx_user_option_selections_trip" ON "public"."user_option_selections" USING "btree" ("trip_id");



CREATE INDEX "idx_user_option_selections_user" ON "public"."user_option_selections" USING "btree" ("user_id");



CREATE INDEX "idx_user_scramble_stats_trip" ON "public"."user_scramble_stats" USING "btree" ("trip_id");



CREATE INDEX "idx_user_scramble_stats_user" ON "public"."user_scramble_stats" USING "btree" ("user_id");



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE UNIQUE INDEX "users_phone_unique" ON "public"."users" USING "btree" ("phone") WHERE ("phone" IS NOT NULL);



CREATE OR REPLACE TRIGGER "bspitw_bonus_points_updated_at" BEFORE UPDATE ON "public"."bspitw_bonus_points" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "course_tees_updated_at" BEFORE UPDATE ON "public"."course_tees" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "courses_updated_at" BEFORE UPDATE ON "public"."courses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "event_player_handicaps_updated_at" BEFORE UPDATE ON "public"."event_player_handicaps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "kgb_cup_hole_scores_updated_at" BEFORE UPDATE ON "public"."kgb_cup_hole_scores" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "kgb_cup_pair_handicaps_updated_at" BEFORE UPDATE ON "public"."kgb_cup_pair_handicaps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "kgb_cup_player_handicaps_updated_at" BEFORE UPDATE ON "public"."kgb_cup_player_handicaps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "notebook_notes_updated_at" BEFORE UPDATE ON "public"."notebook_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "option_groups_updated_at" BEFORE UPDATE ON "public"."option_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "pickem_games_updated_at" BEFORE UPDATE ON "public"."pickem_games" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "pickem_picks_updated_at" BEFORE UPDATE ON "public"."pickem_picks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "pickem_settings_updated_at" BEFORE UPDATE ON "public"."pickem_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "player_handicaps_updated_at" BEFORE UPDATE ON "public"."player_handicaps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "rookie_nominations_updated_at" BEFORE UPDATE ON "public"."rookie_nominations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "round_players_updated_at" BEFORE UPDATE ON "public"."round_players" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "round_scores_updated_at" BEFORE UPDATE ON "public"."round_scores" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "rounds_updated_at" BEFORE UPDATE ON "public"."rounds" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "scramble_hole_scores_updated_at" BEFORE UPDATE ON "public"."scramble_hole_scores" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_articles_updated_at" BEFORE UPDATE ON "public"."articles" FOR EACH ROW EXECUTE FUNCTION "public"."update_articles_updated_at"();



CREATE OR REPLACE TRIGGER "songs_updated_at" BEFORE UPDATE ON "public"."songs" FOR EACH ROW EXECUTE FUNCTION "public"."update_songs_updated_at"();



CREATE OR REPLACE TRIGGER "trip_option_settings_updated_at" BEFORE UPDATE ON "public"."trip_option_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trip_options_updated_at" BEFORE UPDATE ON "public"."trip_options" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "user_option_selections_updated_at" BEFORE UPDATE ON "public"."user_option_selections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "user_scramble_stats_updated_at" BEFORE UPDATE ON "public"."user_scramble_stats" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."accolades"
    ADD CONSTRAINT "accolades_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."accolades"
    ADD CONSTRAINT "accolades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_generations"
    ADD CONSTRAINT "ai_generations_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_generations"
    ADD CONSTRAINT "ai_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."article_views"
    ADD CONSTRAINT "article_views_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."article_views"
    ADD CONSTRAINT "article_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_featured_image_id_fkey" FOREIGN KEY ("featured_image_id") REFERENCES "public"."gallery_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."best_line_submissions"
    ADD CONSTRAINT "best_line_submissions_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."best_line_submissions"
    ADD CONSTRAINT "best_line_submissions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."birthday_posts"
    ADD CONSTRAINT "birthday_posts_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."birthday_posts"
    ADD CONSTRAINT "birthday_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcast_lists"
    ADD CONSTRAINT "broadcast_lists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bspitw_bonus_points"
    ADD CONSTRAINT "bspitw_bonus_points_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."scramble_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bspitw_bonus_points"
    ADD CONSTRAINT "bspitw_bonus_points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calcutta_buyer_paid"
    ADD CONSTRAINT "calcutta_buyer_paid_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calcutta_buyer_paid"
    ADD CONSTRAINT "calcutta_buyer_paid_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calcutta_ownership"
    ADD CONSTRAINT "calcutta_ownership_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calcutta_ownership"
    ADD CONSTRAINT "calcutta_ownership_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."contest_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calcutta_prizes"
    ADD CONSTRAINT "calcutta_prizes_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calcutta_prizes"
    ADD CONSTRAINT "calcutta_prizes_linked_contest_id_fkey" FOREIGN KEY ("linked_contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calcutta_winner_paid"
    ADD CONSTRAINT "calcutta_winner_paid_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calcutta_winner_paid"
    ADD CONSTRAINT "calcutta_winner_paid_prize_id_fkey" FOREIGN KEY ("prize_id") REFERENCES "public"."calcutta_prizes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_hidden_messages"
    ADD CONSTRAINT "chat_hidden_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_hidden_messages"
    ADD CONSTRAINT "chat_hidden_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."chat_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_public_user_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_reactions"
    ADD CONSTRAINT "chat_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_reactions"
    ADD CONSTRAINT "chat_reactions_public_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_reactions"
    ADD CONSTRAINT "chat_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_read_receipts"
    ADD CONSTRAINT "chat_read_receipts_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_read_receipts"
    ADD CONSTRAINT "chat_read_receipts_public_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_read_receipts"
    ADD CONSTRAINT "chat_read_receipts_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_read_receipts"
    ADD CONSTRAINT "chat_read_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_public_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."composition_tee_mappings"
    ADD CONSTRAINT "composition_tee_mappings_source_tee_id_fkey" FOREIGN KEY ("source_tee_id") REFERENCES "public"."course_tees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."composition_tee_mappings"
    ADD CONSTRAINT "composition_tee_mappings_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "public"."course_tees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contest_hole_tees"
    ADD CONSTRAINT "contest_hole_tees_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contest_hole_tees"
    ADD CONSTRAINT "contest_hole_tees_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "public"."course_tees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contest_participants"
    ADD CONSTRAINT "contest_participants_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contest_participants"
    ADD CONSTRAINT "contest_participants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contest_participants"
    ADD CONSTRAINT "contest_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contest_winners"
    ADD CONSTRAINT "contest_winners_prize_id_fkey" FOREIGN KEY ("prize_id") REFERENCES "public"."calcutta_prizes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contest_winners"
    ADD CONSTRAINT "contest_winners_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contest_winners"
    ADD CONSTRAINT "contest_winners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contests"
    ADD CONSTRAINT "contests_scoring_closed_by_fkey" FOREIGN KEY ("scoring_closed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contests"
    ADD CONSTRAINT "contests_scoring_opened_by_fkey" FOREIGN KEY ("scoring_opened_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contests"
    ADD CONSTRAINT "contests_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contests"
    ADD CONSTRAINT "contests_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contests"
    ADD CONSTRAINT "contests_winners_locked_by_fkey" FOREIGN KEY ("winners_locked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cornhole_bracket_matches"
    ADD CONSTRAINT "cornhole_bracket_matches_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cornhole_bracket_matches"
    ADD CONSTRAINT "cornhole_bracket_matches_next_loser_match_id_fkey" FOREIGN KEY ("next_loser_match_id") REFERENCES "public"."cornhole_bracket_matches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cornhole_bracket_matches"
    ADD CONSTRAINT "cornhole_bracket_matches_next_winner_match_id_fkey" FOREIGN KEY ("next_winner_match_id") REFERENCES "public"."cornhole_bracket_matches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cornhole_team_members"
    ADD CONSTRAINT "cornhole_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."cornhole_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cornhole_team_members"
    ADD CONSTRAINT "cornhole_team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cornhole_teams"
    ADD CONSTRAINT "cornhole_teams_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_holes"
    ADD CONSTRAINT "course_holes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_holes"
    ADD CONSTRAINT "course_holes_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "public"."course_tees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_tees"
    ADD CONSTRAINT "course_tees_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_contest_winners"
    ADD CONSTRAINT "daily_contest_winners_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_contest_winners"
    ADD CONSTRAINT "daily_contest_winners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_days"
    ADD CONSTRAINT "event_days_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_player_handicaps"
    ADD CONSTRAINT "event_player_handicaps_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_player_handicaps"
    ADD CONSTRAINT "event_player_handicaps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fake_ad_loozers"
    ADD CONSTRAINT "fake_ad_loozers_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "public"."fake_ads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fake_ad_loozers"
    ADD CONSTRAINT "fake_ad_loozers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fake_ads"
    ADD CONSTRAINT "fake_ads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_contest_participants"
    ADD CONSTRAINT "financial_contest_participants_financial_contest_id_fkey" FOREIGN KEY ("financial_contest_id") REFERENCES "public"."financial_contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_contest_participants"
    ADD CONSTRAINT "financial_contest_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_contests"
    ADD CONSTRAINT "financial_contests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."financial_transaction_history"
    ADD CONSTRAINT "financial_transaction_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_financial_contest_id_fkey" FOREIGN KEY ("financial_contest_id") REFERENCES "public"."financial_contests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."trip_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_comments"
    ADD CONSTRAINT "gallery_comments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."gallery_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_comments"
    ADD CONSTRAINT "gallery_comments_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_comments"
    ADD CONSTRAINT "gallery_comments_sender_public_user_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_items"
    ADD CONSTRAINT "gallery_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gallery_items"
    ADD CONSTRAINT "gallery_items_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_items"
    ADD CONSTRAINT "gallery_items_uploader_public_user_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_reactions"
    ADD CONSTRAINT "gallery_reactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."gallery_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_reactions"
    ADD CONSTRAINT "gallery_reactions_public_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_reactions"
    ADD CONSTRAINT "gallery_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_tags"
    ADD CONSTRAINT "gallery_tags_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."gallery_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_tags"
    ADD CONSTRAINT "gallery_tags_tagged_public_user_fk" FOREIGN KEY ("tagged_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_tags"
    ADD CONSTRAINT "gallery_tags_tagged_user_id_fkey" FOREIGN KEY ("tagged_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_tags"
    ADD CONSTRAINT "gallery_tags_tagger_id_fkey" FOREIGN KEY ("tagger_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_tags"
    ADD CONSTRAINT "gallery_tags_tagger_public_user_fk" FOREIGN KEY ("tagger_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."handicap_history"
    ADD CONSTRAINT "handicap_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hundred_feet_scores"
    ADD CONSTRAINT "hundred_feet_scores_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hundred_feet_scores"
    ADD CONSTRAINT "hundred_feet_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kgb_cup_pair_handicaps"
    ADD CONSTRAINT "kgb_cup_pair_handicaps_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kgb_cup_pair_handicaps"
    ADD CONSTRAINT "kgb_cup_pair_handicaps_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."ryder_cup_pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kgb_cup_player_handicaps"
    ADD CONSTRAINT "kgb_cup_player_handicaps_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kgb_cup_player_handicaps"
    ADD CONSTRAINT "kgb_cup_player_handicaps_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loozer_bios"
    ADD CONSTRAINT "loozer_bios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notebook_categories"
    ADD CONSTRAINT "notebook_categories_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notebook_notes"
    ADD CONSTRAINT "notebook_notes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."notebook_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notebook_notes"
    ADD CONSTRAINT "notebook_notes_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_public_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."option_groups"
    ADD CONSTRAINT "option_groups_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickem_games"
    ADD CONSTRAINT "pickem_games_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickem_payments"
    ADD CONSTRAINT "pickem_payments_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickem_payments"
    ADD CONSTRAINT "pickem_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickem_payouts"
    ADD CONSTRAINT "pickem_payouts_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickem_payouts"
    ADD CONSTRAINT "pickem_payouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickem_picks"
    ADD CONSTRAINT "pickem_picks_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."pickem_games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickem_picks"
    ADD CONSTRAINT "pickem_picks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickem_settings"
    ADD CONSTRAINT "pickem_settings_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_handicaps"
    ADD CONSTRAINT "player_handicaps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rookie_nominations"
    ADD CONSTRAINT "rookie_nominations_created_user_id_fkey" FOREIGN KEY ("created_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rookie_nominations"
    ADD CONSTRAINT "rookie_nominations_nominator_id_fkey" FOREIGN KEY ("nominator_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rookie_nominations"
    ADD CONSTRAINT "rookie_nominations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."room_assignments"
    ADD CONSTRAINT "room_assignments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_assignments"
    ADD CONSTRAINT "room_assignments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_assignments"
    ADD CONSTRAINT "room_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."round_players"
    ADD CONSTRAINT "round_players_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."round_players"
    ADD CONSTRAINT "round_players_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "public"."course_tees"("id");



ALTER TABLE ONLY "public"."round_players"
    ADD CONSTRAINT "round_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."round_scores"
    ADD CONSTRAINT "round_scores_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."round_scores"
    ADD CONSTRAINT "round_scores_round_player_id_fkey" FOREIGN KEY ("round_player_id") REFERENCES "public"."round_players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rounds"
    ADD CONSTRAINT "rounds_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");



ALTER TABLE ONLY "public"."rounds"
    ADD CONSTRAINT "rounds_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rounds"
    ADD CONSTRAINT "rounds_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "public"."course_tees"("id");



ALTER TABLE ONLY "public"."ryder_cup_pairs"
    ADD CONSTRAINT "ryder_cup_pairs_player_a_id_fkey" FOREIGN KEY ("player_a_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ryder_cup_pairs"
    ADD CONSTRAINT "ryder_cup_pairs_player_b_id_fkey" FOREIGN KEY ("player_b_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ryder_cup_pairs"
    ADD CONSTRAINT "ryder_cup_pairs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."ryder_cup_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ryder_cup_teams"
    ADD CONSTRAINT "ryder_cup_teams_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_announcements"
    ADD CONSTRAINT "scheduled_announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_announcements"
    ADD CONSTRAINT "scheduled_announcements_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scramble_hole_scores"
    ADD CONSTRAINT "scramble_hole_scores_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."scramble_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scramble_team_members"
    ADD CONSTRAINT "scramble_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."scramble_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scramble_team_members"
    ADD CONSTRAINT "scramble_team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scramble_teams"
    ADD CONSTRAINT "scramble_teams_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scramble_teams"
    ADD CONSTRAINT "scramble_teams_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."song_favorites"
    ADD CONSTRAINT "song_favorites_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."song_favorites"
    ADD CONSTRAINT "song_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."song_plays"
    ADD CONSTRAINT "song_plays_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."song_plays"
    ADD CONSTRAINT "song_plays_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."songs"
    ADD CONSTRAINT "songs_tagged_user_id_fkey" FOREIGN KEY ("tagged_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tee_time_players"
    ADD CONSTRAINT "tee_time_players_tee_time_id_fkey" FOREIGN KEY ("tee_time_id") REFERENCES "public"."tee_times"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tee_time_players"
    ADD CONSTRAINT "tee_time_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tee_time_reminders_sent"
    ADD CONSTRAINT "tee_time_reminders_sent_tee_time_id_fkey" FOREIGN KEY ("tee_time_id") REFERENCES "public"."tee_times"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tee_time_reminders_sent"
    ADD CONSTRAINT "tee_time_reminders_sent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tee_times"
    ADD CONSTRAINT "tee_times_scramble_team_id_fkey" FOREIGN KEY ("scramble_team_id") REFERENCES "public"."scramble_teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tee_times"
    ADD CONSTRAINT "tee_times_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_facilities"
    ADD CONSTRAINT "trip_facilities_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_facilities"
    ADD CONSTRAINT "trip_facilities_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_option_settings"
    ADD CONSTRAINT "trip_option_settings_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_options"
    ADD CONSTRAINT "trip_options_depends_on_option_id_fkey" FOREIGN KEY ("depends_on_option_id") REFERENCES "public"."trip_options"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_options"
    ADD CONSTRAINT "trip_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."option_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_options"
    ADD CONSTRAINT "trip_options_linked_contest_id_fkey" FOREIGN KEY ("linked_contest_id") REFERENCES "public"."contests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_options"
    ADD CONSTRAINT "trip_options_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_settings"
    ADD CONSTRAINT "trip_settings_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");



ALTER TABLE ONLY "public"."user_action_completions"
    ADD CONSTRAINT "user_action_completions_action_item_id_fkey" FOREIGN KEY ("action_item_id") REFERENCES "public"."action_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_action_completions"
    ADD CONSTRAINT "user_action_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_option_selections"
    ADD CONSTRAINT "user_option_selections_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."trip_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_option_selections"
    ADD CONSTRAINT "user_option_selections_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_option_selections"
    ADD CONSTRAINT "user_option_selections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_scramble_stats"
    ADD CONSTRAINT "user_scramble_stats_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trip_settings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_scramble_stats"
    ADD CONSTRAINT "user_scramble_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete course_holes" ON "public"."course_holes" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can delete course_tees" ON "public"."course_tees" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can delete courses" ON "public"."courses" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can delete event days" ON "public"."event_days" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can delete nominations" ON "public"."rookie_nominations" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can delete users" ON "public"."users" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can insert event days" ON "public"."event_days" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can insert users" ON "public"."users" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage accolades" ON "public"."accolades" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage action items" ON "public"."action_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage all completions" ON "public"."user_action_completions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage bracket matches" ON "public"."cornhole_bracket_matches" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage broadcast lists" ON "public"."broadcast_lists" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage bspitw bonus points" ON "public"."bspitw_bonus_points" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage calcutta buyer paid" ON "public"."calcutta_buyer_paid" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage calcutta ownership" ON "public"."calcutta_ownership" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage calcutta prizes" ON "public"."calcutta_prizes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage calcutta winner paid" ON "public"."calcutta_winner_paid" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage composition_tee_mappings" ON "public"."composition_tee_mappings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage contest participants" ON "public"."contest_participants" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage contest winners" ON "public"."contest_winners" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage contest_hole_tees" ON "public"."contest_hole_tees" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage contests" ON "public"."contests" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage cornhole team members" ON "public"."cornhole_team_members" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage cornhole teams" ON "public"."cornhole_teams" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage event participants" ON "public"."event_participants" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage event_player_handicaps" ON "public"."event_player_handicaps" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage facilities" ON "public"."facilities" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage fake_ad_loozers" ON "public"."fake_ad_loozers" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage fake_ads" ON "public"."fake_ads" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage financial_contest_participants" ON "public"."financial_contest_participants" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage financial_contests" ON "public"."financial_contests" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage financial_transaction_history" ON "public"."financial_transaction_history" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage financial_transactions" ON "public"."financial_transactions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage itinerary" ON "public"."itinerary_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage kgb_cup_hole_scores" ON "public"."kgb_cup_hole_scores" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage kgb_cup_pair_handicaps" ON "public"."kgb_cup_pair_handicaps" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage kgb_cup_player_handicaps" ON "public"."kgb_cup_player_handicaps" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage notebook_categories" ON "public"."notebook_categories" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage notebook_notes" ON "public"."notebook_notes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage option_groups" ON "public"."option_groups" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage pickem payouts" ON "public"."pickem_payouts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage pickem_games" ON "public"."pickem_games" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage pickem_payments" ON "public"."pickem_payments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage pickem_picks" ON "public"."pickem_picks" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage pickem_settings" ON "public"."pickem_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage room assignments" ON "public"."room_assignments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage rooms" ON "public"."rooms" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage ryder cup pairs" ON "public"."ryder_cup_pairs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage ryder cup teams" ON "public"."ryder_cup_teams" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage scheduled announcements" ON "public"."scheduled_announcements" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage scramble hole scores" ON "public"."scramble_hole_scores" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage scramble stats" ON "public"."user_scramble_stats" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage scramble team members" ON "public"."scramble_team_members" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage scramble teams" ON "public"."scramble_teams" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage tee time players" ON "public"."tee_time_players" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage tee times" ON "public"."tee_times" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage tee_time_reminders_sent" ON "public"."tee_time_reminders_sent" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage trip settings" ON "public"."trip_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage trip_facilities" ON "public"."trip_facilities" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage trip_option_settings" ON "public"."trip_option_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can manage trip_options" ON "public"."trip_options" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can read all article views" ON "public"."article_views" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can read broadcast lists" ON "public"."broadcast_lists" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can read financial_transaction_history" ON "public"."financial_transaction_history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can read scheduled announcements" ON "public"."scheduled_announcements" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can update all users" ON "public"."users" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can update event days" ON "public"."event_days" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Admins can update nominations" ON "public"."rookie_nominations" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins read all ai_generations" ON "public"."ai_generations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Anyone can read course_holes" ON "public"."course_holes" FOR SELECT USING (true);



CREATE POLICY "Anyone can read course_tees" ON "public"."course_tees" FOR SELECT USING (true);



CREATE POLICY "Anyone can read courses" ON "public"."courses" FOR SELECT USING (true);



CREATE POLICY "Anyone can read handicap history" ON "public"."handicap_history" FOR SELECT USING (true);



CREATE POLICY "Anyone can read handicaps" ON "public"."player_handicaps" FOR SELECT USING (true);



CREATE POLICY "Anyone can read users" ON "public"."users" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can add gallery comments" ON "public"."gallery_comments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Authenticated users can add gallery reactions" ON "public"."gallery_reactions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can add gallery tags" ON "public"."gallery_tags" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "tagger_id"));



CREATE POLICY "Authenticated users can create chat rooms" ON "public"."chat_rooms" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can insert courses" ON "public"."courses" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can insert holes on unlocked courses" ON "public"."course_holes" FOR INSERT WITH CHECK (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."courses"
  WHERE (("courses"."id" = "course_holes"."course_id") AND ("courses"."locked" = false))))));



CREATE POLICY "Authenticated users can insert own article views" ON "public"."article_views" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Authenticated users can insert room members" ON "public"."chat_room_members" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can insert tees on unlocked courses" ON "public"."course_tees" FOR INSERT WITH CHECK (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."courses"
  WHERE (("courses"."id" = "course_tees"."course_id") AND ("courses"."locked" = false))))));



CREATE POLICY "Authenticated users can read accolades" ON "public"."accolades" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read action completions" ON "public"."user_action_completions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read action items" ON "public"."action_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read bracket matches" ON "public"."cornhole_bracket_matches" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read bspitw bonus points" ON "public"."bspitw_bonus_points" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read calcutta buyer paid" ON "public"."calcutta_buyer_paid" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read calcutta ownership" ON "public"."calcutta_ownership" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read calcutta prizes" ON "public"."calcutta_prizes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read calcutta winner paid" ON "public"."calcutta_winner_paid" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read composition_tee_mappings" ON "public"."composition_tee_mappings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read contest participants" ON "public"."contest_participants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read contest winners" ON "public"."contest_winners" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read contest_hole_tees" ON "public"."contest_hole_tees" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read contests" ON "public"."contests" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read cornhole team members" ON "public"."cornhole_team_members" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read cornhole teams" ON "public"."cornhole_teams" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read daily_contest_winners" ON "public"."daily_contest_winners" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read event days" ON "public"."event_days" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read event participants" ON "public"."event_participants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read event_player_handicaps" ON "public"."event_player_handicaps" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read facilities" ON "public"."facilities" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read financial_contest_participants" ON "public"."financial_contest_participants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read financial_contests" ON "public"."financial_contests" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read gallery comments" ON "public"."gallery_comments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read gallery items" ON "public"."gallery_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read gallery reactions" ON "public"."gallery_reactions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read gallery tags" ON "public"."gallery_tags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read hundred_feet_scores" ON "public"."hundred_feet_scores" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read itinerary" ON "public"."itinerary_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read kgb_cup_hole_scores" ON "public"."kgb_cup_hole_scores" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read kgb_cup_pair_handicaps" ON "public"."kgb_cup_pair_handicaps" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read kgb_cup_player_handicaps" ON "public"."kgb_cup_player_handicaps" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read notebook_categories" ON "public"."notebook_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read notebook_notes" ON "public"."notebook_notes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read option_groups" ON "public"."option_groups" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read pickem_games" ON "public"."pickem_games" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read pickem_payments" ON "public"."pickem_payments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read pickem_picks" ON "public"."pickem_picks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read pickem_settings" ON "public"."pickem_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read room assignments" ON "public"."room_assignments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read rooms" ON "public"."rooms" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read ryder cup pairs" ON "public"."ryder_cup_pairs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read ryder cup teams" ON "public"."ryder_cup_teams" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read scramble hole scores" ON "public"."scramble_hole_scores" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read scramble stats" ON "public"."user_scramble_stats" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read scramble team members" ON "public"."scramble_team_members" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read scramble teams" ON "public"."scramble_teams" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read tee time players" ON "public"."tee_time_players" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read tee times" ON "public"."tee_times" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read trip settings" ON "public"."trip_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read trip_facilities" ON "public"."trip_facilities" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read trip_option_settings" ON "public"."trip_option_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read trip_options" ON "public"."trip_options" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update holes on unlocked courses" ON "public"."course_holes" FOR UPDATE USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."courses"
  WHERE (("courses"."id" = "course_holes"."course_id") AND ("courses"."locked" = false))))));



CREATE POLICY "Authenticated users can update own article views" ON "public"."article_views" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Authenticated users can update tees on unlocked courses" ON "public"."course_tees" FOR UPDATE USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."courses"
  WHERE (("courses"."id" = "course_tees"."course_id") AND ("courses"."locked" = false))))));



CREATE POLICY "Authenticated users can update unlocked courses" ON "public"."courses" FOR UPDATE USING (("public"."is_admin"() OR ("locked" = false)));



CREATE POLICY "Authenticated users can upload gallery items" ON "public"."gallery_items" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "uploader_id"));



CREATE POLICY "Authenticated users can view pickem payouts" ON "public"."pickem_payouts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Members can add reactions" ON "public"."chat_reactions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_message_room_member"("message_id")));



CREATE POLICY "Members can delete own membership" ON "public"."chat_room_members" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Members can read chat rooms" ON "public"."chat_rooms" FOR SELECT USING ("public"."is_chat_room_member"("id"));



CREATE POLICY "Members can read messages" ON "public"."chat_messages" FOR SELECT USING ("public"."is_chat_room_member"("room_id"));



CREATE POLICY "Members can read reactions" ON "public"."chat_reactions" FOR SELECT USING ("public"."is_message_room_member"("message_id"));



CREATE POLICY "Members can read receipts" ON "public"."chat_read_receipts" FOR SELECT USING ("public"."is_chat_room_member"("room_id"));



CREATE POLICY "Members can read room membership" ON "public"."chat_room_members" FOR SELECT USING ("public"."is_chat_room_member"("room_id"));



CREATE POLICY "Members can send messages" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND "public"."is_chat_room_member"("room_id")));



CREATE POLICY "Members can update chat rooms" ON "public"."chat_rooms" FOR UPDATE USING ("public"."is_chat_room_member"("id"));



CREATE POLICY "Members can update own membership" ON "public"."chat_room_members" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Players can insert scores for open foursomes" ON "public"."kgb_cup_hole_scores" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM ((("public"."ryder_cup_pairs" "p1"
     JOIN "public"."ryder_cup_teams" "t1" ON (("t1"."id" = "p1"."team_id")))
     JOIN "public"."ryder_cup_teams" "t2" ON ((("t2"."contest_id" = "t1"."contest_id") AND ("t2"."id" <> "t1"."id"))))
     JOIN "public"."ryder_cup_pairs" "p2" ON ((("p2"."team_id" = "t2"."id") AND ("p2"."sort_order" = "p1"."sort_order"))))
  WHERE (("p1"."id" = "kgb_cup_hole_scores"."foursome_id") AND (("p1"."player_a_id" = "auth"."uid"()) OR ("p1"."player_b_id" = "auth"."uid"()) OR ("p2"."player_a_id" = "auth"."uid"()) OR ("p2"."player_b_id" = "auth"."uid"()))))) AND (NOT (EXISTS ( SELECT 1
   FROM (("public"."ryder_cup_pairs" "p"
     JOIN "public"."ryder_cup_teams" "t" ON (("t"."id" = "p"."team_id")))
     JOIN "public"."contests" "c" ON (("c"."id" = "t"."contest_id")))
  WHERE (("p"."id" = "kgb_cup_hole_scores"."foursome_id") AND ("c"."scoring_closed_at" IS NOT NULL)))))));



CREATE POLICY "Players can update scores for open foursomes" ON "public"."kgb_cup_hole_scores" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ((("public"."ryder_cup_pairs" "p1"
     JOIN "public"."ryder_cup_teams" "t1" ON (("t1"."id" = "p1"."team_id")))
     JOIN "public"."ryder_cup_teams" "t2" ON ((("t2"."contest_id" = "t1"."contest_id") AND ("t2"."id" <> "t1"."id"))))
     JOIN "public"."ryder_cup_pairs" "p2" ON ((("p2"."team_id" = "t2"."id") AND ("p2"."sort_order" = "p1"."sort_order"))))
  WHERE (("p1"."id" = "kgb_cup_hole_scores"."foursome_id") AND (("p1"."player_a_id" = "auth"."uid"()) OR ("p1"."player_b_id" = "auth"."uid"()) OR ("p2"."player_a_id" = "auth"."uid"()) OR ("p2"."player_b_id" = "auth"."uid"()))))) AND (NOT (EXISTS ( SELECT 1
   FROM (("public"."ryder_cup_pairs" "p"
     JOIN "public"."ryder_cup_teams" "t" ON (("t"."id" = "p"."team_id")))
     JOIN "public"."contests" "c" ON (("c"."id" = "t"."contest_id")))
  WHERE (("p"."id" = "kgb_cup_hole_scores"."foursome_id") AND ("c"."scoring_closed_at" IS NOT NULL))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ((("public"."ryder_cup_pairs" "p1"
     JOIN "public"."ryder_cup_teams" "t1" ON (("t1"."id" = "p1"."team_id")))
     JOIN "public"."ryder_cup_teams" "t2" ON ((("t2"."contest_id" = "t1"."contest_id") AND ("t2"."id" <> "t1"."id"))))
     JOIN "public"."ryder_cup_pairs" "p2" ON ((("p2"."team_id" = "t2"."id") AND ("p2"."sort_order" = "p1"."sort_order"))))
  WHERE (("p1"."id" = "kgb_cup_hole_scores"."foursome_id") AND (("p1"."player_a_id" = "auth"."uid"()) OR ("p1"."player_b_id" = "auth"."uid"()) OR ("p2"."player_a_id" = "auth"."uid"()) OR ("p2"."player_b_id" = "auth"."uid"()))))) AND (NOT (EXISTS ( SELECT 1
   FROM (("public"."ryder_cup_pairs" "p"
     JOIN "public"."ryder_cup_teams" "t" ON (("t"."id" = "p"."team_id")))
     JOIN "public"."contests" "c" ON (("c"."id" = "t"."contest_id")))
  WHERE (("p"."id" = "kgb_cup_hole_scores"."foursome_id") AND ("c"."scoring_closed_at" IS NOT NULL)))))));



CREATE POLICY "Published articles are readable" ON "public"."articles" FOR SELECT USING ((("publish_at" IS NOT NULL) AND ("publish_at" <= "now"())));



CREATE POLICY "Service role full access" ON "public"."articles" USING (true) WITH CHECK (true);



CREATE POLICY "Service role inserts notifications" ON "public"."notifications" FOR INSERT WITH CHECK (true);



CREATE POLICY "Taggers and admins can remove gallery tags" ON "public"."gallery_tags" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "tagger_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Team members can manage unverified bonus points" ON "public"."bspitw_bonus_points" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."scramble_team_members" "stm"
     JOIN "public"."scramble_teams" "st" ON (("st"."id" = "stm"."team_id")))
  WHERE (("stm"."team_id" = "bspitw_bonus_points"."team_id") AND ("stm"."user_id" = "auth"."uid"()) AND ("st"."verified_at" IS NULL)))) AND (NOT (EXISTS ( SELECT 1
   FROM ("public"."contests" "c"
     JOIN "public"."scramble_teams" "st" ON (("st"."contest_id" = "c"."id")))
  WHERE (("st"."id" = "bspitw_bonus_points"."team_id") AND ("c"."scoring_closed_at" IS NOT NULL))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."scramble_team_members" "stm"
     JOIN "public"."scramble_teams" "st" ON (("st"."id" = "stm"."team_id")))
  WHERE (("stm"."team_id" = "bspitw_bonus_points"."team_id") AND ("stm"."user_id" = "auth"."uid"()) AND ("st"."verified_at" IS NULL)))) AND (NOT (EXISTS ( SELECT 1
   FROM ("public"."contests" "c"
     JOIN "public"."scramble_teams" "st" ON (("st"."contest_id" = "c"."id")))
  WHERE (("st"."id" = "bspitw_bonus_points"."team_id") AND ("c"."scoring_closed_at" IS NOT NULL)))))));



CREATE POLICY "Team members can manage unverified hole scores" ON "public"."scramble_hole_scores" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."scramble_team_members" "stm"
     JOIN "public"."scramble_teams" "st" ON (("st"."id" = "stm"."team_id")))
  WHERE (("stm"."team_id" = "scramble_hole_scores"."team_id") AND ("stm"."user_id" = "auth"."uid"()) AND ("st"."verified_at" IS NULL)))) AND (NOT (EXISTS ( SELECT 1
   FROM ("public"."contests" "c"
     JOIN "public"."scramble_teams" "st" ON (("st"."contest_id" = "c"."id")))
  WHERE (("st"."id" = "scramble_hole_scores"."team_id") AND ("c"."scoring_closed_at" IS NOT NULL))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."scramble_team_members" "stm"
     JOIN "public"."scramble_teams" "st" ON (("st"."id" = "stm"."team_id")))
  WHERE (("stm"."team_id" = "scramble_hole_scores"."team_id") AND ("stm"."user_id" = "auth"."uid"()) AND ("st"."verified_at" IS NULL)))) AND (NOT (EXISTS ( SELECT 1
   FROM ("public"."contests" "c"
     JOIN "public"."scramble_teams" "st" ON (("st"."contest_id" = "c"."id")))
  WHERE (("st"."id" = "scramble_hole_scores"."team_id") AND ("c"."scoring_closed_at" IS NOT NULL)))))));



CREATE POLICY "Uploaders and admins can delete gallery items" ON "public"."gallery_items" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "uploader_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can delete own completions" ON "public"."user_action_completions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own participation" ON "public"."event_participants" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete scores" ON "public"."round_scores" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."round_players" "rp"
     JOIN "public"."rounds" "r" ON (("r"."id" = "rp"."round_id")))
  WHERE (("rp"."id" = "round_scores"."round_player_id") AND (("rp"."user_id" = "auth"."uid"()) OR ("r"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Users can delete their own selections" ON "public"."user_option_selections" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can insert nominations" ON "public"."rookie_nominations" FOR INSERT WITH CHECK (("nominator_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own completions" ON "public"."user_action_completions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own participation" ON "public"."event_participants" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own read receipts" ON "public"."chat_read_receipts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert scores" ON "public"."round_scores" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."round_players" "rp"
     JOIN "public"."rounds" "r" ON (("r"."id" = "rp"."round_id")))
  WHERE (("rp"."id" = "round_scores"."round_player_id") AND (("rp"."user_id" = "auth"."uid"()) OR ("r"."created_by" = "auth"."uid"()) OR ("rp"."is_scorer" = true))))));



CREATE POLICY "Users can insert their own handicap" ON "public"."player_handicaps" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own history" ON "public"."handicap_history" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage their own selections" ON "public"."user_option_selections" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can read active fake_ads" ON "public"."fake_ads" FOR SELECT TO "authenticated" USING ((("active" = true) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can read fake_ad_loozers" ON "public"."fake_ad_loozers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can read own nominations" ON "public"."rookie_nominations" FOR SELECT USING ((("nominator_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "Users can read their own selections" ON "public"."user_option_selections" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can read their own transactions" ON "public"."financial_transactions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can remove own gallery reactions" ON "public"."gallery_reactions" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can remove own reactions" ON "public"."chat_reactions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own participation" ON "public"."event_participants" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own read receipts" ON "public"."chat_read_receipts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update scores" ON "public"."round_scores" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."round_players" "rp"
     JOIN "public"."rounds" "r" ON (("r"."id" = "rp"."round_id")))
  WHERE (("rp"."id" = "round_scores"."round_player_id") AND (("rp"."user_id" = "auth"."uid"()) OR ("r"."created_by" = "auth"."uid"()) OR ("rp"."is_scorer" = true))))));



CREATE POLICY "Users can update their own handicap" ON "public"."player_handicaps" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own selections" ON "public"."user_option_selections" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))))) WITH CHECK ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users delete own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own hidden messages" ON "public"."chat_hidden_messages" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own push subscriptions" ON "public"."push_subscriptions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read own ai_generations" ON "public"."ai_generations" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users read own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."accolades" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."action_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_generations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."article_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."articles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "best_line_delete" ON "public"."best_line_submissions" FOR DELETE USING ((("submitter_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."is_admin" = true) OR ((("u"."permissions" ->> 'manage_best_line'::"text"))::boolean = true)))))));



CREATE POLICY "best_line_insert" ON "public"."best_line_submissions" FOR INSERT WITH CHECK (("submitter_id" = "auth"."uid"()));



CREATE POLICY "best_line_select" ON "public"."best_line_submissions" FOR SELECT USING ((("submitter_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."is_admin" = true) OR ((("u"."permissions" ->> 'manage_best_line'::"text"))::boolean = true)))))));



ALTER TABLE "public"."best_line_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."birthday_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."broadcast_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bspitw_bonus_points" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calcutta_buyer_paid" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calcutta_ownership" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calcutta_prizes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calcutta_winner_paid" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_hidden_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_read_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_room_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."composition_tee_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contest_hole_tees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contest_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contest_winners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cornhole_bracket_matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cornhole_team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cornhole_teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_holes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_tees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_contest_winners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_days" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_player_handicaps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facilities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fake_ad_loozers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fake_ads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_contest_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_contests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_transaction_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gallery_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gallery_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gallery_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gallery_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."handicap_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hundred_feet_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."itinerary_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kgb_cup_hole_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kgb_cup_pair_handicaps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kgb_cup_player_handicaps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loozer_bios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loozer_bios_select" ON "public"."loozer_bios" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."notebook_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notebook_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."option_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pickem_games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pickem_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pickem_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pickem_picks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pickem_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_handicaps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rookie_nominations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."room_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."round_players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "round_players_delete" ON "public"."round_players" FOR DELETE USING ("public"."is_round_creator"("round_id"));



CREATE POLICY "round_players_insert" ON "public"."round_players" FOR INSERT WITH CHECK ("public"."is_round_creator"("round_id"));



CREATE POLICY "round_players_select" ON "public"."round_players" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_round_creator"("round_id")));



CREATE POLICY "round_players_update" ON "public"."round_players" FOR UPDATE USING ("public"."is_round_creator"("round_id"));



ALTER TABLE "public"."round_scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "round_scores_insert" ON "public"."round_scores" FOR INSERT WITH CHECK (("public"."is_round_creator"("round_id") OR "public"."is_round_player"("round_id")));



CREATE POLICY "round_scores_select" ON "public"."round_scores" FOR SELECT USING (("public"."is_round_creator"("round_id") OR "public"."is_round_player"("round_id")));



CREATE POLICY "round_scores_update" ON "public"."round_scores" FOR UPDATE USING (("public"."is_round_creator"("round_id") OR "public"."is_round_player"("round_id")));



ALTER TABLE "public"."rounds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rounds_delete" ON "public"."rounds" FOR DELETE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "rounds_insert" ON "public"."rounds" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "rounds_select" ON "public"."rounds" FOR SELECT USING ((("created_by" = "auth"."uid"()) OR "public"."is_round_player"("id")));



CREATE POLICY "rounds_update" ON "public"."rounds" FOR UPDATE USING (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."ryder_cup_pairs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ryder_cup_teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scheduled_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scramble_hole_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scramble_team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scramble_teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."song_favorites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "song_favorites_delete" ON "public"."song_favorites" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "song_favorites_insert" ON "public"."song_favorites" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "song_favorites_select" ON "public"."song_favorites" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."song_plays" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "song_plays_insert" ON "public"."song_plays" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."songs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "songs_select" ON "public"."songs" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."tee_time_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tee_time_reminders_sent" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tee_times" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_facilities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_option_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_action_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_option_selections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_scramble_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."activity_stats"("since_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."activity_stats"("since_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."activity_stats"("since_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_chat_room_member"("p_room_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_chat_room_member"("p_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_chat_room_member"("p_room_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_message_room_member"("p_message_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_message_room_member"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_message_room_member"("p_message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_round_creator"("p_round_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_round_creator"("p_round_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_round_creator"("p_round_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_round_player"("p_round_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_round_player"("p_round_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_round_player"("p_round_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_articles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_articles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_articles_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_songs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_songs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_songs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_round"("round_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_round"("round_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_round"("round_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."accolades" TO "anon";
GRANT ALL ON TABLE "public"."accolades" TO "authenticated";
GRANT ALL ON TABLE "public"."accolades" TO "service_role";



GRANT ALL ON TABLE "public"."action_items" TO "anon";
GRANT ALL ON TABLE "public"."action_items" TO "authenticated";
GRANT ALL ON TABLE "public"."action_items" TO "service_role";



GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."ai_generations" TO "anon";
GRANT ALL ON TABLE "public"."ai_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_generations" TO "service_role";



GRANT ALL ON TABLE "public"."article_views" TO "anon";
GRANT ALL ON TABLE "public"."article_views" TO "authenticated";
GRANT ALL ON TABLE "public"."article_views" TO "service_role";



GRANT ALL ON TABLE "public"."articles" TO "anon";
GRANT ALL ON TABLE "public"."articles" TO "authenticated";
GRANT ALL ON TABLE "public"."articles" TO "service_role";



GRANT ALL ON TABLE "public"."best_line_submissions" TO "anon";
GRANT ALL ON TABLE "public"."best_line_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."best_line_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."birthday_posts" TO "anon";
GRANT ALL ON TABLE "public"."birthday_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."birthday_posts" TO "service_role";



GRANT ALL ON TABLE "public"."broadcast_lists" TO "anon";
GRANT ALL ON TABLE "public"."broadcast_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcast_lists" TO "service_role";



GRANT ALL ON TABLE "public"."bspitw_bonus_points" TO "anon";
GRANT ALL ON TABLE "public"."bspitw_bonus_points" TO "authenticated";
GRANT ALL ON TABLE "public"."bspitw_bonus_points" TO "service_role";



GRANT ALL ON TABLE "public"."calcutta_buyer_paid" TO "anon";
GRANT ALL ON TABLE "public"."calcutta_buyer_paid" TO "authenticated";
GRANT ALL ON TABLE "public"."calcutta_buyer_paid" TO "service_role";



GRANT ALL ON TABLE "public"."calcutta_ownership" TO "anon";
GRANT ALL ON TABLE "public"."calcutta_ownership" TO "authenticated";
GRANT ALL ON TABLE "public"."calcutta_ownership" TO "service_role";



GRANT ALL ON TABLE "public"."calcutta_prizes" TO "anon";
GRANT ALL ON TABLE "public"."calcutta_prizes" TO "authenticated";
GRANT ALL ON TABLE "public"."calcutta_prizes" TO "service_role";



GRANT ALL ON TABLE "public"."calcutta_winner_paid" TO "anon";
GRANT ALL ON TABLE "public"."calcutta_winner_paid" TO "authenticated";
GRANT ALL ON TABLE "public"."calcutta_winner_paid" TO "service_role";



GRANT ALL ON TABLE "public"."chat_hidden_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_hidden_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_hidden_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_reactions" TO "anon";
GRANT ALL ON TABLE "public"."chat_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."chat_read_receipts" TO "anon";
GRANT ALL ON TABLE "public"."chat_read_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_read_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."chat_room_members" TO "anon";
GRANT ALL ON TABLE "public"."chat_room_members" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_room_members" TO "service_role";



GRANT ALL ON TABLE "public"."chat_rooms" TO "anon";
GRANT ALL ON TABLE "public"."chat_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."composition_tee_mappings" TO "anon";
GRANT ALL ON TABLE "public"."composition_tee_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."composition_tee_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."contest_hole_tees" TO "anon";
GRANT ALL ON TABLE "public"."contest_hole_tees" TO "authenticated";
GRANT ALL ON TABLE "public"."contest_hole_tees" TO "service_role";



GRANT ALL ON TABLE "public"."contest_participants" TO "anon";
GRANT ALL ON TABLE "public"."contest_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."contest_participants" TO "service_role";



GRANT ALL ON TABLE "public"."contest_winners" TO "anon";
GRANT ALL ON TABLE "public"."contest_winners" TO "authenticated";
GRANT ALL ON TABLE "public"."contest_winners" TO "service_role";



GRANT ALL ON TABLE "public"."contests" TO "anon";
GRANT ALL ON TABLE "public"."contests" TO "authenticated";
GRANT ALL ON TABLE "public"."contests" TO "service_role";



GRANT ALL ON TABLE "public"."cornhole_bracket_matches" TO "anon";
GRANT ALL ON TABLE "public"."cornhole_bracket_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."cornhole_bracket_matches" TO "service_role";



GRANT ALL ON TABLE "public"."cornhole_team_members" TO "anon";
GRANT ALL ON TABLE "public"."cornhole_team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."cornhole_team_members" TO "service_role";



GRANT ALL ON TABLE "public"."cornhole_teams" TO "anon";
GRANT ALL ON TABLE "public"."cornhole_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."cornhole_teams" TO "service_role";



GRANT ALL ON TABLE "public"."course_holes" TO "anon";
GRANT ALL ON TABLE "public"."course_holes" TO "authenticated";
GRANT ALL ON TABLE "public"."course_holes" TO "service_role";



GRANT ALL ON TABLE "public"."course_tees" TO "anon";
GRANT ALL ON TABLE "public"."course_tees" TO "authenticated";
GRANT ALL ON TABLE "public"."course_tees" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."daily_contest_winners" TO "anon";
GRANT ALL ON TABLE "public"."daily_contest_winners" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_contest_winners" TO "service_role";



GRANT ALL ON TABLE "public"."event_days" TO "anon";
GRANT ALL ON TABLE "public"."event_days" TO "authenticated";
GRANT ALL ON TABLE "public"."event_days" TO "service_role";



GRANT ALL ON TABLE "public"."event_participants" TO "anon";
GRANT ALL ON TABLE "public"."event_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."event_participants" TO "service_role";



GRANT ALL ON TABLE "public"."event_player_handicaps" TO "anon";
GRANT ALL ON TABLE "public"."event_player_handicaps" TO "authenticated";
GRANT ALL ON TABLE "public"."event_player_handicaps" TO "service_role";



GRANT ALL ON TABLE "public"."facilities" TO "anon";
GRANT ALL ON TABLE "public"."facilities" TO "authenticated";
GRANT ALL ON TABLE "public"."facilities" TO "service_role";



GRANT ALL ON TABLE "public"."fake_ad_loozers" TO "anon";
GRANT ALL ON TABLE "public"."fake_ad_loozers" TO "authenticated";
GRANT ALL ON TABLE "public"."fake_ad_loozers" TO "service_role";



GRANT ALL ON TABLE "public"."fake_ads" TO "anon";
GRANT ALL ON TABLE "public"."fake_ads" TO "authenticated";
GRANT ALL ON TABLE "public"."fake_ads" TO "service_role";



GRANT ALL ON TABLE "public"."financial_contest_participants" TO "anon";
GRANT ALL ON TABLE "public"."financial_contest_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_contest_participants" TO "service_role";



GRANT ALL ON TABLE "public"."financial_contests" TO "anon";
GRANT ALL ON TABLE "public"."financial_contests" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_contests" TO "service_role";



GRANT ALL ON TABLE "public"."financial_transaction_history" TO "anon";
GRANT ALL ON TABLE "public"."financial_transaction_history" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_transaction_history" TO "service_role";



GRANT ALL ON TABLE "public"."financial_transactions" TO "anon";
GRANT ALL ON TABLE "public"."financial_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_comments" TO "anon";
GRANT ALL ON TABLE "public"."gallery_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_comments" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_items" TO "anon";
GRANT ALL ON TABLE "public"."gallery_items" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_items" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_reactions" TO "anon";
GRANT ALL ON TABLE "public"."gallery_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_tags" TO "anon";
GRANT ALL ON TABLE "public"."gallery_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_tags" TO "service_role";



GRANT ALL ON TABLE "public"."handicap_history" TO "anon";
GRANT ALL ON TABLE "public"."handicap_history" TO "authenticated";
GRANT ALL ON TABLE "public"."handicap_history" TO "service_role";



GRANT ALL ON TABLE "public"."hundred_feet_scores" TO "anon";
GRANT ALL ON TABLE "public"."hundred_feet_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."hundred_feet_scores" TO "service_role";



GRANT ALL ON TABLE "public"."itinerary_items" TO "anon";
GRANT ALL ON TABLE "public"."itinerary_items" TO "authenticated";
GRANT ALL ON TABLE "public"."itinerary_items" TO "service_role";



GRANT ALL ON TABLE "public"."kgb_cup_hole_scores" TO "anon";
GRANT ALL ON TABLE "public"."kgb_cup_hole_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."kgb_cup_hole_scores" TO "service_role";



GRANT ALL ON TABLE "public"."kgb_cup_pair_handicaps" TO "anon";
GRANT ALL ON TABLE "public"."kgb_cup_pair_handicaps" TO "authenticated";
GRANT ALL ON TABLE "public"."kgb_cup_pair_handicaps" TO "service_role";



GRANT ALL ON TABLE "public"."kgb_cup_player_handicaps" TO "anon";
GRANT ALL ON TABLE "public"."kgb_cup_player_handicaps" TO "authenticated";
GRANT ALL ON TABLE "public"."kgb_cup_player_handicaps" TO "service_role";



GRANT ALL ON TABLE "public"."loozer_bios" TO "anon";
GRANT ALL ON TABLE "public"."loozer_bios" TO "authenticated";
GRANT ALL ON TABLE "public"."loozer_bios" TO "service_role";



GRANT ALL ON TABLE "public"."notebook_categories" TO "anon";
GRANT ALL ON TABLE "public"."notebook_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."notebook_categories" TO "service_role";



GRANT ALL ON TABLE "public"."notebook_notes" TO "anon";
GRANT ALL ON TABLE "public"."notebook_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."notebook_notes" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."option_groups" TO "anon";
GRANT ALL ON TABLE "public"."option_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."option_groups" TO "service_role";



GRANT ALL ON TABLE "public"."pickem_games" TO "anon";
GRANT ALL ON TABLE "public"."pickem_games" TO "authenticated";
GRANT ALL ON TABLE "public"."pickem_games" TO "service_role";



GRANT ALL ON TABLE "public"."pickem_payments" TO "anon";
GRANT ALL ON TABLE "public"."pickem_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."pickem_payments" TO "service_role";



GRANT ALL ON TABLE "public"."pickem_payouts" TO "anon";
GRANT ALL ON TABLE "public"."pickem_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."pickem_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."pickem_picks" TO "anon";
GRANT ALL ON TABLE "public"."pickem_picks" TO "authenticated";
GRANT ALL ON TABLE "public"."pickem_picks" TO "service_role";



GRANT ALL ON TABLE "public"."pickem_settings" TO "anon";
GRANT ALL ON TABLE "public"."pickem_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."pickem_settings" TO "service_role";



GRANT ALL ON TABLE "public"."player_handicaps" TO "anon";
GRANT ALL ON TABLE "public"."player_handicaps" TO "authenticated";
GRANT ALL ON TABLE "public"."player_handicaps" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."rookie_nominations" TO "anon";
GRANT ALL ON TABLE "public"."rookie_nominations" TO "authenticated";
GRANT ALL ON TABLE "public"."rookie_nominations" TO "service_role";



GRANT ALL ON TABLE "public"."room_assignments" TO "anon";
GRANT ALL ON TABLE "public"."room_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."room_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."rooms" TO "anon";
GRANT ALL ON TABLE "public"."rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms" TO "service_role";



GRANT ALL ON TABLE "public"."round_players" TO "anon";
GRANT ALL ON TABLE "public"."round_players" TO "authenticated";
GRANT ALL ON TABLE "public"."round_players" TO "service_role";



GRANT ALL ON TABLE "public"."round_scores" TO "anon";
GRANT ALL ON TABLE "public"."round_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."round_scores" TO "service_role";



GRANT ALL ON TABLE "public"."rounds" TO "anon";
GRANT ALL ON TABLE "public"."rounds" TO "authenticated";
GRANT ALL ON TABLE "public"."rounds" TO "service_role";



GRANT ALL ON TABLE "public"."ryder_cup_pairs" TO "anon";
GRANT ALL ON TABLE "public"."ryder_cup_pairs" TO "authenticated";
GRANT ALL ON TABLE "public"."ryder_cup_pairs" TO "service_role";



GRANT ALL ON TABLE "public"."ryder_cup_teams" TO "anon";
GRANT ALL ON TABLE "public"."ryder_cup_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."ryder_cup_teams" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_announcements" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_announcements" TO "service_role";



GRANT ALL ON TABLE "public"."scramble_hole_scores" TO "anon";
GRANT ALL ON TABLE "public"."scramble_hole_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."scramble_hole_scores" TO "service_role";



GRANT ALL ON TABLE "public"."scramble_team_members" TO "anon";
GRANT ALL ON TABLE "public"."scramble_team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."scramble_team_members" TO "service_role";



GRANT ALL ON TABLE "public"."scramble_teams" TO "anon";
GRANT ALL ON TABLE "public"."scramble_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."scramble_teams" TO "service_role";



GRANT ALL ON TABLE "public"."song_favorites" TO "anon";
GRANT ALL ON TABLE "public"."song_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."song_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."song_plays" TO "anon";
GRANT ALL ON TABLE "public"."song_plays" TO "authenticated";
GRANT ALL ON TABLE "public"."song_plays" TO "service_role";



GRANT ALL ON TABLE "public"."songs" TO "anon";
GRANT ALL ON TABLE "public"."songs" TO "authenticated";
GRANT ALL ON TABLE "public"."songs" TO "service_role";



GRANT ALL ON TABLE "public"."tee_time_players" TO "anon";
GRANT ALL ON TABLE "public"."tee_time_players" TO "authenticated";
GRANT ALL ON TABLE "public"."tee_time_players" TO "service_role";



GRANT ALL ON TABLE "public"."tee_time_reminders_sent" TO "anon";
GRANT ALL ON TABLE "public"."tee_time_reminders_sent" TO "authenticated";
GRANT ALL ON TABLE "public"."tee_time_reminders_sent" TO "service_role";



GRANT ALL ON TABLE "public"."tee_times" TO "anon";
GRANT ALL ON TABLE "public"."tee_times" TO "authenticated";
GRANT ALL ON TABLE "public"."tee_times" TO "service_role";



GRANT ALL ON TABLE "public"."trip_facilities" TO "anon";
GRANT ALL ON TABLE "public"."trip_facilities" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_facilities" TO "service_role";



GRANT ALL ON TABLE "public"."trip_option_settings" TO "anon";
GRANT ALL ON TABLE "public"."trip_option_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_option_settings" TO "service_role";



GRANT ALL ON TABLE "public"."trip_options" TO "anon";
GRANT ALL ON TABLE "public"."trip_options" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_options" TO "service_role";



GRANT ALL ON TABLE "public"."trip_settings" TO "anon";
GRANT ALL ON TABLE "public"."trip_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_action_completions" TO "anon";
GRANT ALL ON TABLE "public"."user_action_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_action_completions" TO "service_role";



GRANT ALL ON TABLE "public"."user_option_selections" TO "anon";
GRANT ALL ON TABLE "public"."user_option_selections" TO "authenticated";
GRANT ALL ON TABLE "public"."user_option_selections" TO "service_role";



GRANT ALL ON TABLE "public"."user_scramble_stats" TO "anon";
GRANT ALL ON TABLE "public"."user_scramble_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."user_scramble_stats" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







