export type Team     = 'Cairo' | 'India' | 'Admin'
export type Role     = 'operator' | 'admin'
export type Status   = 'Pending' | 'In Progress' | 'Yes' | 'Already Updated' | 'Not Found On Any Source' | 'Player Not Found Online' | 'Blocked'
export type Category = 'Date of Birth' | 'Height & Weight' | 'Hometown Update' | 'Profile Pic Update'

export const CATEGORIES: Category[] = ['Date of Birth', 'Height & Weight', 'Hometown Update', 'Profile Pic Update']
export const STATUSES: Status[] = ['Pending', 'In Progress', 'Yes', 'Already Updated', 'Not Found On Any Source', 'Player Not Found Online', 'Blocked']
export const TEAMS: Team[] = ['Cairo', 'India']

export const CAT_ICON: Record<Category, string> = {
  'Date of Birth':      '🎂',
  'Height & Weight':    '📏',
  'Hometown Update':    '🏠',
  'Profile Pic Update': '📸',
}

export const STATUS_COLOR: Record<Status, { bg: string; text: string }> = {
  'Pending':                 { bg: '#374151', text: '#d1d5db' },
  'In Progress':             { bg: '#1d4ed8', text: '#ffffff' },
  'Yes':                     { bg: '#15803d', text: '#ffffff' },
  'Already Updated':         { bg: '#065f46', text: '#6ee7b7' },
  'Not Found On Any Source': { bg: '#92400e', text: '#fef3c7' },
  'Player Not Found Online': { bg: '#581c87', text: '#f3e8ff' },
  'Blocked':                 { bg: '#b91c1c', text: '#ffffff' },
}

export const TEAM_COLOR: Record<Team, string> = {
  'Cairo': '#f97316',
  'India': '#3b82f6',
  'Admin': '#a855f7',
}

export interface UserProfile {
  id:        string
  email:     string
  full_name: string | null
  team:      Team
  role:      Role
}

export interface Player {
  player_id:                                 number
  full_name:                                 string
  birthday:                                  string | null
  team_id:                                   number | null
  national_team_id:                          number | null
  club_sweater_num:                          number | null
  player_nationality_1:                      number | null
  player_nationality_2:                      number | null
  player_posititon1:                         number | null
  player_posititon2:                         number | null
  player_posititon3:                         number | null
  c_contract_status:                         number | null
  player_preffered_hand:                     number | null
  player_gender:                             number | null
  height:                                    number | null
  weight:                                    number | null
  most_team_id:                              number | null
  team_ids:                                  string | null
  last_team_id:                              number | null
  last_team_name:                            string | null
  skill_ids:                                 string | null
  player_last_match_name:                    string | null
  player_last_match_tournament_name:         string | null
  player_last_match_season_name:             string | null
  player_last_match_tournament_country_name: string | null
  club_team_top_competitions_2026_ids:       string | null
  club_team_top_competitions_2026_names:     string | null
}

export interface PlayerTask {
  id:            string
  player_id:     number
  category:      Category
  status:        Status
  assigned_to:   string | null
  updated_by:    string | null
  team:          Team | null
  notes:         string | null
  source_urls:   string[]
  updated_at:    string
  completed_at:  string | null
  operator_id:   string | null
  operator_name: string | null
}

export interface TournamentAssignment {
  id:               string
  tournament_name:  string | null
  assigned_team:    Team | null
  assigned_by_name: string | null
  player_count:     number
  assigned_at:      string | null
}

export interface AuditLog {
  id:              string
  task_id:         string
  player_id:       number
  category:        string
  changed_by_name: string | null
  changed_by_team: string | null
  old_status:      string | null
  new_status:      string
  source_urls:     string[]
  notes:           string | null
  changed_at:      string
}

export interface KPIs {
  totalPlayers:    number
  completedTasks:  number
  totalTasks:      number
  blockedTasks:    number
  inProgressTasks: number
}

export interface Summary {
  team:           string
  category:       string
  pending:        number
  in_progress:    number
  completed:      number
  blocked:        number
  total:          number
  completion_pct: number
}
