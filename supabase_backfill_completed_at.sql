-- Backfill completed_at for tasks that are done but have NULL completed_at
-- Uses updated_at as the best available timestamp
UPDATE player_tasks
SET completed_at = updated_at
WHERE status NOT IN ('Pending', 'In Progress')
  AND completed_at IS NULL
  AND updated_at IS NOT NULL;

-- Verify
SELECT status, COUNT(*) as total,
  COUNT(completed_at) as has_completed_at,
  COUNT(*) - COUNT(completed_at) as missing_completed_at
FROM player_tasks
WHERE status NOT IN ('Pending', 'In Progress')
GROUP BY status;
