-- ============================================================
-- HOCKEY PLAYER PROFILE TRACKER — COMPLETE DATABASE SETUP
-- Run this ENTIRE file in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- PART 1: BASE SCHEMA
-- ============================================================

-- 1. PLAYERS TABLE (all 27 columns from CSV)
CREATE TABLE IF NOT EXISTS players (
  player_id                                   BIGINT PRIMARY KEY,
  full_name                                   TEXT NOT NULL,
  birthday                                    TEXT,
  team_id                                     BIGINT,
  national_team_id                            BIGINT,
  club_sweater_num                            INT,
  player_nationality_1                        INT,
  player_nationality_2                        INT,
  player_posititon1                           INT,
  player_posititon2                           INT,
  player_posititon3                           INT,
  c_contract_status                           INT,
  player_preffered_hand                       INT,
  player_gender                               INT,
  height                                      NUMERIC,
  weight                                      NUMERIC,
  most_team_id                                BIGINT,
  team_ids                                    TEXT,
  last_team_id                                BIGINT,
  last_team_name                              TEXT,
  skill_ids                                   TEXT,
  player_last_match_name                      TEXT,
  player_last_match_tournament_name           TEXT,
  player_last_match_season_name               TEXT,
  player_last_match_tournament_country_name   TEXT,
  club_team_top_competitions_2026_ids         TEXT,
  club_team_top_competitions_2026_names       TEXT,
  created_at                                  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. USER PROFILES
CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  team        TEXT NOT NULL CHECK (team IN ('Cairo', 'India', 'Admin')),
  role        TEXT NOT NULL CHECK (role IN ('operator', 'admin')) DEFAULT 'operator',
  is_active   BOOLEAN DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PLAYER TASKS
CREATE TABLE IF NOT EXISTS player_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     BIGINT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  category      TEXT NOT NULL CHECK (category IN (
                  'Date of Birth', 'Height & Weight', 'Hometown Update', 'Profile Pic Update'
                )),
  status        TEXT NOT NULL CHECK (status IN (
                  'Pending', 'In Progress', 'Yes', 'Already Updated',
                  'Not Found On Any Source', 'Player Not Found Online', 'Blocked'
                )) DEFAULT 'Pending',
  assigned_to   UUID REFERENCES user_profiles(id),
  updated_by    UUID REFERENCES user_profiles(id),
  operator_id   UUID REFERENCES user_profiles(id),
  operator_name TEXT,
  team          TEXT CHECK (team IN ('Cairo', 'India')),
  notes         TEXT,
  source_urls   TEXT[] DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  UNIQUE (player_id, category)
);

-- 4. TOURNAMENT ASSIGNMENTS
CREATE TABLE IF NOT EXISTS tournament_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_name   TEXT,
  assigned_team     TEXT CHECK (assigned_team IN ('Cairo', 'India')),
  profile_pic_team  TEXT CHECK (profile_pic_team IN ('Cairo', 'India')),
  is_active         BOOLEAN DEFAULT true,
  assigned_by       UUID REFERENCES user_profiles(id),
  assigned_by_name  TEXT,
  player_count      INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index for tournament_name (handles NULL correctly)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tournament_name_coalesce
  ON tournament_assignments (COALESCE(tournament_name, '##NULL##'));

-- 5. TASK AUDIT LOG
CREATE TABLE IF NOT EXISTS task_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID REFERENCES player_tasks(id) ON DELETE CASCADE,
  player_id        BIGINT,
  category         TEXT,
  changed_by       UUID REFERENCES user_profiles(id),
  changed_by_name  TEXT,
  changed_by_team  TEXT,
  old_status       TEXT,
  new_status       TEXT,
  source_urls      TEXT[],
  notes            TEXT,
  changed_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PART 2: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_player_tasks_player_id     ON player_tasks(player_id);
CREATE INDEX IF NOT EXISTS idx_player_tasks_status        ON player_tasks(status);
CREATE INDEX IF NOT EXISTS idx_player_tasks_category      ON player_tasks(category);
CREATE INDEX IF NOT EXISTS idx_player_tasks_team          ON player_tasks(team);
CREATE INDEX IF NOT EXISTS idx_player_tasks_assigned      ON player_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_players_full_name          ON players(full_name);
CREATE INDEX IF NOT EXISTS idx_players_last_team          ON players(last_team_id);
CREATE INDEX IF NOT EXISTS idx_players_nationality        ON players(player_nationality_1);
CREATE INDEX IF NOT EXISTS idx_players_tournament         ON players(player_last_match_tournament_name);
CREATE INDEX IF NOT EXISTS idx_players_gender             ON players(player_gender);
CREATE INDEX IF NOT EXISTS idx_players_tournament_team    ON players(player_last_match_tournament_name, last_team_name);
CREATE INDEX IF NOT EXISTS idx_tasks_operator_category    ON player_tasks(operator_id, category);
CREATE INDEX IF NOT EXISTS idx_tasks_status_category      ON player_tasks(status, category);
CREATE INDEX IF NOT EXISTS idx_tasks_team_status          ON player_tasks(team, status);
CREATE INDEX IF NOT EXISTS idx_tasks_player_category      ON player_tasks(player_id, category);
CREATE INDEX IF NOT EXISTS idx_tasks_operator_status_cat  ON player_tasks(operator_id, status, category) WHERE operator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_unclaimed            ON player_tasks(player_id, category) WHERE operator_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_changed_at           ON task_audit_log(changed_at);
CREATE INDEX IF NOT EXISTS idx_audit_changed_by           ON task_audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_new_status           ON task_audit_log(new_status);
CREATE INDEX IF NOT EXISTS idx_audit_category             ON task_audit_log(category);
CREATE INDEX IF NOT EXISTS idx_audit_date_operator        ON task_audit_log(changed_at, changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_log_task_id          ON task_audit_log(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_player_id        ON task_audit_log(player_id);
CREATE INDEX IF NOT EXISTS idx_pt_operator_id             ON player_tasks(operator_id);

-- ============================================================
-- PART 3: ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE players            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_audit_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_assignments ENABLE ROW LEVEL SECURITY;

-- Players
DROP POLICY IF EXISTS "Players readable by authenticated" ON players;
CREATE POLICY "Players readable by authenticated" ON players
  FOR SELECT USING (auth.role() = 'authenticated');

-- User profiles
DROP POLICY IF EXISTS "User can read own profile"       ON user_profiles;
DROP POLICY IF EXISTS "Admin can read all profiles"     ON user_profiles;
DROP POLICY IF EXISTS "User can update own profile"     ON user_profiles;
DROP POLICY IF EXISTS "Admin can update all profiles"   ON user_profiles;

CREATE POLICY "User can read own profile" ON user_profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "User can update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Admin can update all profiles" ON user_profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Player tasks
DROP POLICY IF EXISTS "All authenticated read tasks"    ON player_tasks;
DROP POLICY IF EXISTS "Authenticated can insert tasks"  ON player_tasks;
DROP POLICY IF EXISTS "Active users can update tasks"   ON player_tasks;

CREATE POLICY "All authenticated read tasks" ON player_tasks
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can insert tasks" ON player_tasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Active users can update tasks" ON player_tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND (is_active IS NULL OR is_active = true)
    )
  );

-- Audit log
DROP POLICY IF EXISTS "All authenticated can read audit log"  ON task_audit_log;
DROP POLICY IF EXISTS "Authenticated insert audit log"        ON task_audit_log;

CREATE POLICY "All authenticated can read audit log" ON task_audit_log
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated insert audit log" ON task_audit_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Tournament assignments
DROP POLICY IF EXISTS "All authenticated read tournament_assignments" ON tournament_assignments;
DROP POLICY IF EXISTS "Admin manage tournament_assignments"           ON tournament_assignments;

CREATE POLICY "All authenticated read tournament_assignments" ON tournament_assignments
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin manage tournament_assignments" ON tournament_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- PART 4: TRIGGER — Auto-create tasks on player insert
-- ============================================================

CREATE OR REPLACE FUNCTION initialize_player_tasks()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO player_tasks (player_id, category, status, source_urls)
  VALUES
    (NEW.player_id, 'Date of Birth',     'Pending', '{}'),
    (NEW.player_id, 'Height & Weight',   'Pending', '{}'),
    (NEW.player_id, 'Hometown Update',   'Pending', '{}'),
    (NEW.player_id, 'Profile Pic Update','Pending', '{}')
  ON CONFLICT (player_id, category) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_player_insert ON players;
CREATE TRIGGER after_player_insert
  AFTER INSERT ON players
  FOR EACH ROW EXECUTE FUNCTION initialize_player_tasks();

-- ============================================================
-- PART 5: VIEWS
-- ============================================================

-- Team progress summary
CREATE OR REPLACE VIEW team_progress_summary AS
SELECT
  team, category,
  COUNT(*) FILTER (WHERE status = 'Pending')                      AS pending,
  COUNT(*) FILTER (WHERE status = 'In Progress')                  AS in_progress,
  COUNT(*) FILTER (WHERE status NOT IN ('Pending','In Progress')) AS completed,
  COUNT(*) FILTER (WHERE status = 'Blocked')                      AS blocked,
  COUNT(*)                                                         AS total,
  ROUND(
    COUNT(*) FILTER (WHERE status NOT IN ('Pending','In Progress')) * 100.0
    / NULLIF(COUNT(*), 0), 1
  ) AS completion_pct
FROM player_tasks
WHERE team IS NOT NULL
GROUP BY team, category
ORDER BY team, category;

GRANT SELECT ON team_progress_summary TO authenticated;

-- Tournament overview
CREATE OR REPLACE VIEW tournament_overview AS
SELECT
  p.player_last_match_tournament_name                              AS tournament_name,
  COUNT(DISTINCT p.player_id)                                      AS player_count,
  ta.assigned_team,
  ta.profile_pic_team,
  ta.is_active,
  ta.assigned_by_name,
  ta.updated_at                                                    AS assigned_at,
  COUNT(pt.id) FILTER (WHERE pt.category = 'Date of Birth'      AND pt.status = 'Pending') AS dob_pending,
  COUNT(pt.id) FILTER (WHERE pt.category = 'Height & Weight'    AND pt.status = 'Pending') AS htw_pending,
  COUNT(pt.id) FILTER (WHERE pt.category = 'Hometown Update'    AND pt.status = 'Pending') AS htn_pending,
  COUNT(pt.id) FILTER (WHERE pt.category = 'Profile Pic Update' AND pt.status = 'Pending') AS pic_pending,
  COUNT(pt.id) FILTER (WHERE pt.status NOT IN ('Pending','In Progress'))                    AS total_done,
  COUNT(pt.id)                                                                               AS total_tasks
FROM players p
LEFT JOIN tournament_assignments ta
  ON (p.player_last_match_tournament_name = ta.tournament_name)
  OR (p.player_last_match_tournament_name IS NULL AND ta.tournament_name IS NULL)
LEFT JOIN player_tasks pt ON pt.player_id = p.player_id
GROUP BY
  p.player_last_match_tournament_name,
  ta.assigned_team, ta.profile_pic_team, ta.is_active,
  ta.assigned_by_name, ta.updated_at
ORDER BY
  ta.assigned_team NULLS LAST,
  COUNT(DISTINCT p.player_id) DESC,
  p.player_last_match_tournament_name ASC NULLS LAST;

GRANT SELECT ON tournament_overview TO authenticated;

-- Daily activity (for time analytics)
CREATE OR REPLACE VIEW daily_activity AS
SELECT
  DATE(changed_at AT TIME ZONE 'Asia/Kolkata')                        AS activity_date,
  EXTRACT(HOUR FROM changed_at AT TIME ZONE 'Asia/Kolkata')           AS hour_of_day,
  changed_by_name  AS operator_name,
  changed_by_team  AS team,
  category,
  new_status,
  COUNT(*)          AS task_count
FROM task_audit_log
WHERE new_status NOT IN ('Pending')
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY 1 DESC, 2;

GRANT SELECT ON daily_activity TO authenticated;

-- Operator leaderboard
CREATE OR REPLACE VIEW operator_leaderboard AS
SELECT
  changed_by                                                           AS operator_id,
  changed_by_name                                                      AS operator_name,
  changed_by_team                                                      AS team,
  COUNT(*)                                                             AS total_updates,
  COUNT(*) FILTER (WHERE new_status NOT IN ('Pending','In Progress'))  AS completed_count,
  COUNT(*) FILTER (WHERE category = 'Date of Birth')                   AS dob_count,
  COUNT(*) FILTER (WHERE category = 'Height & Weight')                 AS htw_count,
  COUNT(*) FILTER (WHERE category = 'Hometown Update')                 AS htn_count,
  COUNT(*) FILTER (WHERE category = 'Profile Pic Update')              AS pic_count,
  MIN(changed_at)                                                      AS first_activity,
  MAX(changed_at)                                                      AS last_activity,
  COUNT(DISTINCT DATE(changed_at AT TIME ZONE 'Asia/Kolkata'))         AS active_days
FROM task_audit_log
WHERE changed_by_name IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY total_updates DESC;

GRANT SELECT ON operator_leaderboard TO authenticated;

-- Overall status breakdown (for Overview category stats)
CREATE OR REPLACE VIEW overall_status_breakdown AS
SELECT category, status, COUNT(*) AS count
FROM player_tasks
GROUP BY category, status
ORDER BY category, status;

GRANT SELECT ON overall_status_breakdown TO authenticated;

-- Completed players (all 3 core tasks done)
CREATE OR REPLACE VIEW completed_players AS
SELECT
  p.player_id, p.full_name, p.last_team_name,
  p.player_last_match_tournament_name AS tournament_name,
  p.height, p.weight,
  dob.status  AS dob_status,
  htw.status  AS htw_status,
  htn.status  AS htn_status,
  dob.operator_name,
  dob.team,
  GREATEST(dob.completed_at, htw.completed_at, htn.completed_at) AS completed_at
FROM players p
JOIN player_tasks dob ON dob.player_id = p.player_id AND dob.category = 'Date of Birth'
JOIN player_tasks htw ON htw.player_id = p.player_id AND htw.category = 'Height & Weight'
JOIN player_tasks htn ON htn.player_id = p.player_id AND htn.category = 'Hometown Update'
WHERE dob.status NOT IN ('Pending','In Progress')
  AND htw.status NOT IN ('Pending','In Progress')
  AND htn.status NOT IN ('Pending','In Progress')
ORDER BY completed_at DESC NULLS LAST;

GRANT SELECT ON completed_players TO authenticated;

-- ============================================================
-- PART 6: ANALYZE (update query planner statistics)
-- ============================================================

ANALYZE players;
ANALYZE player_tasks;
ANALYZE task_audit_log;
ANALYZE tournament_assignments;

-- ============================================================
-- DONE! Now:
-- 1. Create your admin user in Supabase Auth dashboard
-- 2. Run the INSERT below with your actual UUID
-- 3. Run the Python import script to load players
-- ============================================================

-- INSERT INTO user_profiles (id, email, full_name, team, role)
-- VALUES (
--   'YOUR-UUID-FROM-AUTH',
--   'your@email.com',
--   'Your Name',
--   'Admin',
--   'admin'
-- );
