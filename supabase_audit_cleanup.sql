-- Allow authenticated users to delete audit log entries
-- (needed for unclaim/reset operations)
DROP POLICY IF EXISTS "auth_delete_audit" ON task_audit_log;
CREATE POLICY "auth_delete_audit" ON task_audit_log
  FOR DELETE USING (auth.role() = 'authenticated');

-- Clean up stale audit log entries for players currently in Pending status
-- These are leftovers from previous claim cycles that cause the completion bug
DELETE FROM task_audit_log
WHERE task_id IN (
  SELECT id FROM player_tasks
  WHERE status = 'Pending'
    AND operator_id IS NULL
);

-- Verify cleanup
SELECT
  'Remaining audit entries' AS label,
  COUNT(*) AS count
FROM task_audit_log;

SELECT
  'Pending tasks with no audit entries' AS label,
  COUNT(DISTINCT pt.player_id) AS player_count
FROM player_tasks pt
WHERE pt.status = 'Pending'
  AND pt.operator_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM task_audit_log al WHERE al.task_id = pt.id
  );
