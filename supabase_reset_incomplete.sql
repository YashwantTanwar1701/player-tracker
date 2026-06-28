-- Reset ALL players who have ANY task still Pending or In Progress
-- Moves them back to Available queue with all 4 categories reset to Pending

UPDATE player_tasks
SET
  status        = 'Pending',
  operator_id   = NULL,
  operator_name = NULL,
  assigned_to   = NULL,
  updated_by    = NULL,
  completed_at  = NULL,
  updated_at    = NOW()
WHERE player_id IN (
  -- Players who have at least one task that is Pending or In Progress
  SELECT DISTINCT player_id
  FROM player_tasks
  WHERE status IN ('Pending', 'In Progress')
);

-- Verify result
SELECT
  status,
  COUNT(DISTINCT player_id) AS player_count,
  COUNT(*)                  AS task_count
FROM player_tasks
GROUP BY status
ORDER BY status;
