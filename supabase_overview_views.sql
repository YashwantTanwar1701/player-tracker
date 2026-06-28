-- ============================================================
-- Overview SQL views — all aggregations done server-side
-- No JS row limits. Run in Supabase SQL Editor.
-- ============================================================

-- 1. Operator activity summary within a time range
-- Used by Team/Analyst tab — replaces raw audit_log fetch
CREATE OR REPLACE FUNCTION get_operator_activity(from_ts TIMESTAMPTZ, to_ts TIMESTAMPTZ)
RETURNS TABLE(
  operator_id      UUID,
  operator_name    TEXT,
  team             TEXT,
  total_actions    BIGINT,
  unique_players   BIGINT,
  player_tasks_count BIGINT,
  pic_tasks_count  BIGINT,
  yes_count        BIGINT,
  already_updated  BIGINT,
  not_found        BIGINT,
  not_online       BIGINT,
  blocked_count    BIGINT,
  in_progress_count BIGINT
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    changed_by                                                        AS operator_id,
    changed_by_name                                                   AS operator_name,
    changed_by_team                                                   AS team,
    COUNT(*)                                                          AS total_actions,
    COUNT(DISTINCT player_id)                                         AS unique_players,
    COUNT(*) FILTER (WHERE category != 'Profile Pic Update')          AS player_tasks_count,
    COUNT(*) FILTER (WHERE category = 'Profile Pic Update')           AS pic_tasks_count,
    COUNT(*) FILTER (WHERE new_status = 'Yes')                        AS yes_count,
    COUNT(*) FILTER (WHERE new_status = 'Already Updated')            AS already_updated,
    COUNT(*) FILTER (WHERE new_status = 'Not Found On Any Source')    AS not_found,
    COUNT(*) FILTER (WHERE new_status = 'Player Not Found Online')    AS not_online,
    COUNT(*) FILTER (WHERE new_status = 'Blocked')                    AS blocked_count,
    COUNT(*) FILTER (WHERE new_status = 'In Progress')                AS in_progress_count
  FROM task_audit_log
  WHERE changed_at >= from_ts
    AND changed_at <= to_ts
    AND changed_by IS NOT NULL
  GROUP BY changed_by, changed_by_name, changed_by_team
  ORDER BY COUNT(*) DESC
$$;
GRANT EXECUTE ON FUNCTION get_operator_activity TO authenticated;

-- 2. Daily activity aggregated (replaces raw audit fetch for time charts)
CREATE OR REPLACE FUNCTION get_daily_activity(from_ts TIMESTAMPTZ, to_ts TIMESTAMPTZ)
RETURNS TABLE(
  activity_date DATE,
  hour_of_day   NUMERIC,
  operator_name TEXT,
  team          TEXT,
  category      TEXT,
  new_status    TEXT,
  task_count    BIGINT
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    DATE(changed_at AT TIME ZONE 'Asia/Kolkata') AS activity_date,
    EXTRACT(HOUR FROM changed_at AT TIME ZONE 'Asia/Kolkata') AS hour_of_day,
    changed_by_name,
    changed_by_team,
    category,
    new_status,
    COUNT(*) AS task_count
  FROM task_audit_log
  WHERE changed_at >= from_ts
    AND changed_at <= to_ts
    AND new_status != 'Pending'
  GROUP BY 1,2,3,4,5,6
  ORDER BY 1 DESC, 2
$$;
GRANT EXECUTE ON FUNCTION get_daily_activity TO authenticated;

-- 3. Overall status breakdown scoped to assigned tournaments
-- Replaces the chunked JS fetch that was capped at 1000
CREATE OR REPLACE FUNCTION get_assigned_status_breakdown(tour_names TEXT[])
RETURNS TABLE(
  category TEXT,
  status   TEXT,
  count    BIGINT
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    pt.category,
    pt.status,
    COUNT(*) AS count
  FROM player_tasks pt
  JOIN players p ON p.player_id = pt.player_id
  WHERE p.player_last_match_tournament_name = ANY(tour_names)
  GROUP BY pt.category, pt.status
  ORDER BY pt.category, pt.status
$$;
GRANT EXECUTE ON FUNCTION get_assigned_status_breakdown TO authenticated;

-- 4. Assigned player count per tournament set
CREATE OR REPLACE FUNCTION get_assigned_player_count(tour_names TEXT[])
RETURNS BIGINT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COUNT(DISTINCT player_id)
  FROM players
  WHERE player_last_match_tournament_name = ANY(tour_names)
$$;
GRANT EXECUTE ON FUNCTION get_assigned_player_count TO authenticated;

-- ============================================================
-- UPDATED: get_operator_activity with separate player/pic counts
-- Run this to replace the earlier version
-- ============================================================
CREATE OR REPLACE FUNCTION get_operator_activity(from_ts TIMESTAMPTZ, to_ts TIMESTAMPTZ)
RETURNS TABLE(
  operator_id         UUID,
  operator_name       TEXT,
  team                TEXT,
  total_actions       BIGINT,
  unique_players      BIGINT,
  player_tasks_count  BIGINT,
  pic_tasks_count     BIGINT,
  -- Player category status counts (DOB + HT/WT + Hometown)
  player_yes          BIGINT,
  player_already      BIGINT,
  player_not_found    BIGINT,
  player_not_online   BIGINT,
  player_blocked      BIGINT,
  player_in_progress  BIGINT,
  -- Pic category status counts
  pic_yes             BIGINT,
  pic_already         BIGINT,
  pic_not_found       BIGINT,
  pic_not_online      BIGINT,
  pic_blocked         BIGINT,
  pic_in_progress     BIGINT,
  yes_count           BIGINT,
  already_updated     BIGINT,
  not_found           BIGINT,
  not_online          BIGINT,
  blocked_count       BIGINT,
  in_progress_count   BIGINT
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    changed_by,
    changed_by_name,
    changed_by_team,
    COUNT(*)                                                              AS total_actions,
    COUNT(DISTINCT player_id)                                             AS unique_players,
    COUNT(*) FILTER (WHERE category != 'Profile Pic Update')             AS player_tasks_count,
    COUNT(*) FILTER (WHERE category  = 'Profile Pic Update')             AS pic_tasks_count,
    -- Player cats
    COUNT(*) FILTER (WHERE category != 'Profile Pic Update' AND new_status = 'Yes')                        AS player_yes,
    COUNT(*) FILTER (WHERE category != 'Profile Pic Update' AND new_status = 'Already Updated')            AS player_already,
    COUNT(*) FILTER (WHERE category != 'Profile Pic Update' AND new_status = 'Not Found On Any Source')    AS player_not_found,
    COUNT(*) FILTER (WHERE category != 'Profile Pic Update' AND new_status = 'Player Not Found Online')    AS player_not_online,
    COUNT(*) FILTER (WHERE category != 'Profile Pic Update' AND new_status = 'Blocked')                    AS player_blocked,
    COUNT(*) FILTER (WHERE category != 'Profile Pic Update' AND new_status = 'In Progress')                AS player_in_progress,
    -- Pic cat
    COUNT(*) FILTER (WHERE category  = 'Profile Pic Update' AND new_status = 'Yes')                        AS pic_yes,
    COUNT(*) FILTER (WHERE category  = 'Profile Pic Update' AND new_status = 'Already Updated')            AS pic_already,
    COUNT(*) FILTER (WHERE category  = 'Profile Pic Update' AND new_status = 'Not Found On Any Source')    AS pic_not_found,
    COUNT(*) FILTER (WHERE category  = 'Profile Pic Update' AND new_status = 'Player Not Found Online')    AS pic_not_online,
    COUNT(*) FILTER (WHERE category  = 'Profile Pic Update' AND new_status = 'Blocked')                    AS pic_blocked,
    COUNT(*) FILTER (WHERE category  = 'Profile Pic Update' AND new_status = 'In Progress')                AS pic_in_progress,
    -- Overall
    COUNT(*) FILTER (WHERE new_status = 'Yes')                            AS yes_count,
    COUNT(*) FILTER (WHERE new_status = 'Already Updated')                AS already_updated,
    COUNT(*) FILTER (WHERE new_status = 'Not Found On Any Source')        AS not_found,
    COUNT(*) FILTER (WHERE new_status = 'Player Not Found Online')        AS not_online,
    COUNT(*) FILTER (WHERE new_status = 'Blocked')                        AS blocked_count,
    COUNT(*) FILTER (WHERE new_status = 'In Progress')                    AS in_progress_count
  FROM task_audit_log
  WHERE changed_at >= from_ts
    AND changed_at <= to_ts
    AND changed_by IS NOT NULL
  GROUP BY changed_by, changed_by_name, changed_by_team
  ORDER BY COUNT(*) DESC
$$;
GRANT EXECUTE ON FUNCTION get_operator_activity TO authenticated;

-- ============================================================
-- UPDATED: get_daily_activity — counts UNIQUE PLAYERS per day/hour
-- Drop old version first, then run this
-- ============================================================
DROP FUNCTION IF EXISTS get_daily_activity(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_daily_activity(from_ts TIMESTAMPTZ, to_ts TIMESTAMPTZ)
RETURNS TABLE(
  activity_date DATE,
  hour_of_day   NUMERIC,
  operator_name TEXT,
  team          TEXT,
  player_count  BIGINT
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    DATE(changed_at AT TIME ZONE 'Asia/Kolkata') AS activity_date,
    EXTRACT(HOUR FROM changed_at AT TIME ZONE 'Asia/Kolkata') AS hour_of_day,
    changed_by_name,
    changed_by_team,
    COUNT(DISTINCT player_id) AS player_count   -- unique players, not task count
  FROM task_audit_log
  WHERE changed_at >= from_ts
    AND changed_at <= to_ts
    AND new_status NOT IN ('Pending','In Progress')  -- only resolved statuses
    AND player_id IS NOT NULL
  GROUP BY 1, 2, 3, 4
  ORDER BY 1 DESC, 2
$$;
GRANT EXECUTE ON FUNCTION get_daily_activity TO authenticated;
