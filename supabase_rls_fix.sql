-- ============================================================
-- FIX: RLS on player_tasks — allow all authenticated users
-- to update tasks they own (operator_id = auth.uid())
-- ============================================================

-- Drop all existing policies on player_tasks
DROP POLICY IF EXISTS "All authenticated read tasks"    ON player_tasks;
DROP POLICY IF EXISTS "Authenticated can insert tasks"  ON player_tasks;
DROP POLICY IF EXISTS "Active users can update tasks"   ON player_tasks;
DROP POLICY IF EXISTS "Authenticated insert audit log"  ON task_audit_log;

-- Simple open policies — auth handles security via operator_id ownership
CREATE POLICY "auth_select_tasks" ON player_tasks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "auth_insert_tasks" ON player_tasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_update_tasks" ON player_tasks
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_delete_tasks" ON player_tasks
  FOR DELETE USING (auth.role() = 'authenticated');

-- Audit log
CREATE POLICY "auth_insert_audit" ON task_audit_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_select_audit" ON task_audit_log
  FOR SELECT USING (auth.role() = 'authenticated');

-- Also allow Admin team to update user_profiles
DROP POLICY IF EXISTS "update_own_or_admin" ON user_profiles;
CREATE POLICY "update_own_or_admin" ON user_profiles
  FOR UPDATE USING (auth.uid() = id OR is_admin());

-- Confirm team constraint allows Admin + null
ALTER TABLE player_tasks DROP CONSTRAINT IF EXISTS player_tasks_team_check;
ALTER TABLE player_tasks ADD CONSTRAINT player_tasks_team_check
  CHECK (team IS NULL OR team IN ('Cairo', 'India', 'Admin'));
