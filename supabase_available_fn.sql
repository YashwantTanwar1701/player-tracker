-- Function to get available player IDs for a team's tournaments
-- Returns player_ids that are: in the tournament AND not claimed AND not fully done
CREATE OR REPLACE FUNCTION get_available_player_ids(tour_names TEXT[])
RETURNS TABLE(player_id BIGINT) 
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT DISTINCT p.player_id
  FROM players p
  WHERE p.player_last_match_tournament_name = ANY(tour_names)
    -- Not claimed: no core task has operator_id set
    AND NOT EXISTS (
      SELECT 1 FROM player_tasks pt
      WHERE pt.player_id = p.player_id
        AND pt.category IN ('Date of Birth', 'Height & Weight', 'Hometown Update')
        AND pt.operator_id IS NOT NULL
    )
    -- Not fully done: not all 4 task categories are resolved
    AND (
      SELECT COUNT(*) FROM player_tasks pt
      WHERE pt.player_id = p.player_id
        AND pt.category IN ('Date of Birth', 'Height & Weight', 'Hometown Update', 'Profile Pic Update')
        AND pt.status NOT IN ('Pending', 'In Progress')
    ) < 4
  ORDER BY p.player_id
$$;

GRANT EXECUTE ON FUNCTION get_available_player_ids TO authenticated;

-- Player-level KPI views (1 player = 1 job, not 4 tasks)
CREATE OR REPLACE VIEW player_kpis AS
WITH player_core AS (
  SELECT
    player_id,
    COUNT(*) AS core_total,
    COUNT(*) FILTER (WHERE status NOT IN ('Pending','In Progress')) AS core_done,
    COUNT(*) FILTER (WHERE status = 'In Progress') AS core_inprog,
    COUNT(*) FILTER (WHERE status = 'Blocked') AS core_blocked
  FROM player_tasks
  GROUP BY player_id
)
SELECT
  COUNT(*) AS total_players,
  COUNT(*) FILTER (WHERE core_done >= 4)    AS completed_players,
  COUNT(*) FILTER (WHERE core_inprog > 0 AND core_done < 3) AS inprogress_players,
  COUNT(*) FILTER (WHERE core_blocked > 0)  AS blocked_players,
  COUNT(*) FILTER (WHERE core_done = 0 AND core_inprog = 0) AS pending_players
FROM player_core;

GRANT SELECT ON player_kpis TO authenticated;

-- Category breakdown per player (not per task)
CREATE OR REPLACE VIEW category_player_breakdown AS
SELECT
  category,
  COUNT(*) FILTER (WHERE status = 'Pending')                      AS pending,
  COUNT(*) FILTER (WHERE status = 'In Progress')                  AS in_progress,
  COUNT(*) FILTER (WHERE status NOT IN ('Pending','In Progress')) AS done,
  COUNT(*)                                                         AS total
FROM player_tasks
GROUP BY category;

GRANT SELECT ON category_player_breakdown TO authenticated;
