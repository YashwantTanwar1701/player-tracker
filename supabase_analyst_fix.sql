-- ============================================================
-- FIX 1: operator_leaderboard — count unique players, not audit entries
-- A "completed job" = 1 player where operator resolved at least one task
-- ============================================================

CREATE OR REPLACE VIEW operator_leaderboard AS
WITH player_tasks_summary AS (
  -- For each player+operator combo, determine if all 3 core tasks are done
  SELECT
    operator_id,
    operator_name,
    team,
    player_id,
    -- Player job = all 3 core tasks resolved by same operator
    COUNT(*) FILTER (
      WHERE category IN ('Date of Birth','Height & Weight','Hometown Update')
      AND status NOT IN ('Pending','In Progress')
    ) AS core_done,
    COUNT(*) FILTER (
      WHERE category = 'Profile Pic Update'
      AND status NOT IN ('Pending','In Progress')
    ) AS pic_done,
    MAX(updated_at) AS last_updated
  FROM player_tasks
  WHERE operator_id IS NOT NULL
  GROUP BY operator_id, operator_name, team, player_id
)
SELECT
  operator_id,
  operator_name,
  team,
  -- Total unique players touched
  COUNT(DISTINCT player_id)                                           AS total_updates,
  -- Player jobs completed (all 3 core tasks done) — counts as 1 job per player
  COUNT(DISTINCT player_id) FILTER (WHERE core_done >= 3)            AS completed_count,
  -- Individual task counts (for detail view)
  COUNT(DISTINCT player_id) FILTER (WHERE core_done > 0)             AS dob_count,
  COUNT(DISTINCT player_id) FILTER (WHERE core_done > 0)             AS htw_count,
  COUNT(DISTINCT player_id) FILTER (WHERE core_done > 0)             AS htn_count,
  COUNT(DISTINCT player_id) FILTER (WHERE pic_done > 0)              AS pic_count,
  MIN(last_updated)                                                   AS first_activity,
  MAX(last_updated)                                                   AS last_activity,
  COUNT(DISTINCT DATE(last_updated AT TIME ZONE 'Asia/Kolkata'))      AS active_days
FROM player_tasks_summary
GROUP BY operator_id, operator_name, team
ORDER BY completed_count DESC;

GRANT SELECT ON operator_leaderboard TO authenticated;

-- ============================================================
-- FIX 2: Allow NULL or 'Admin' team in player_tasks for Admin users
-- Remove the team check constraint restriction
-- ============================================================

-- Drop existing team check on player_tasks
ALTER TABLE player_tasks DROP CONSTRAINT IF EXISTS player_tasks_team_check;

-- Recreate allowing NULL (Admin users won't have a Cairo/India team)
ALTER TABLE player_tasks ADD CONSTRAINT player_tasks_team_check
  CHECK (team IS NULL OR team IN ('Cairo', 'India', 'Admin'));

-- ============================================================
-- FIX 3: Confirm the RLS policy allows Admin team to update tasks
-- ============================================================

DROP POLICY IF EXISTS "Active users can update tasks" ON player_tasks;
CREATE POLICY "Active users can update tasks" ON player_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND (is_active IS NULL OR is_active = true)
    )
  );

