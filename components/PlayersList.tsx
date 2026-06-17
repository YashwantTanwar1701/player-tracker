'use client'
import { useTheme, T } from '@/components/Dashboard'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Player, PlayerTask, UserProfile, Status, Category, Team, CATEGORIES, STATUSES, STATUS_COLOR } from '@/types'

const PAGE = 50
const DONE_STATUSES: Status[] = ['Yes', 'Already Updated', 'Not Found On Any Source', 'Player Not Found Online', 'Blocked']

interface TournamentMeta {
  tournament_name:  string | null
  assigned_team:    Team | null
  profile_pic_team: Team | null
  is_active:        boolean
}

function parseArray(val: string | null): string[] {
  if (!val) return []
  return val.replace(/^\{/, '').replace(/\}$/, '').trim().split(',').map(s => s.trim()).filter(Boolean)
}

const GENDER_MAP: Record<number, string> = { 1: 'Male', 2: 'Female' }

// ── Team IDs tooltip ──────────────────────────────────────────────────────
function TeamIdsCell({ val }: { val: string | null }) {
  const theme = useTheme()
  const tk    = T[theme]
  const [pos,  setPos]  = useState<{ x: number; y: number } | null>(null)
  const ids = parseArray(val)

  function handleEnter(e: React.MouseEvent) {
    setPos({ x: e.clientX, y: e.clientY + 12 })
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      <span style={{ background: '#1d4ed8', color: '#fff', fontSize: '11px', fontWeight: 700,
        padding: '2px 8px', borderRadius: '99px', cursor: 'default' }}>
        {ids.length}
      </span>
      {pos && ids.length > 0 && (
        <div style={{ position: 'fixed', left: Math.min(pos.x, window.innerWidth - 300), top: pos.y,
          zIndex: 99999, background: tk.bgCard, border: `1px solid ${tk.borderLight}`, borderRadius: '8px',
          padding: '10px 12px', width: '280px', boxShadow: '0 10px 40px rgba(0,0,0,0.9)',
          pointerEvents: 'none' }}>
          <p style={{ color: tk.textMuted, fontSize: '10px', margin: '0 0 5px', fontWeight: 700, textTransform: 'uppercase' }}>
            Team IDs ({ids.length})
          </p>
          <div style={{ color: tk.text, fontSize: '12px', lineHeight: '1.7',
            maxHeight: '200px', overflowY: 'auto', wordBreak: 'break-all' }}>
            {ids.join(', ')}
          </div>
        </div>
      )}
    </span>
  )
}

// ── Progress Cell ─────────────────────────────────────────────────────────
interface ProgressCellProps {
  task:     PlayerTask | undefined
  category: Category
  player:   Player
  profile:  UserProfile
  onSaved:  (t: PlayerTask) => void
  readonly?: boolean
}

function ProgressCell({ task, category, player, profile, onSaved, readonly }: ProgressCellProps) {
  const supabase = createClient()
  const theme = useTheme()
  const tk    = T[theme]
  const [open,   setOpen]   = useState(false)
  const [status, setStatus] = useState<Status>(task?.status || 'Pending')
  const [notes,  setNotes]  = useState(task?.notes || '')
  const [urls,   setUrls]   = useState<string[]>(task?.source_urls || [])
  const [newUrl, setNewUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  useEffect(() => {
    setStatus(task?.status || 'Pending')
    setNotes(task?.notes || '')
    setUrls(task?.source_urls || [])
  }, [task])

  const sc = STATUS_COLOR[task?.status || 'Pending']

  function addUrl() {
    const u = newUrl.trim()
    if (!u || urls.includes(u)) return
    setUrls(p => [...p, u])
    setNewUrl('')
  }

  async function save() {
    setSaving(true); setError(null)
    const now    = new Date().toISOString()
    const isDone = DONE_STATUSES.includes(status)

    const { data, error: err } = await supabase.from('player_tasks')
      .upsert({
        player_id:     player.player_id,
        category,
        status,
        notes,
        source_urls:   urls,
        assigned_to:   profile.id,
        operator_id:   profile.id,
        operator_name: profile.full_name || profile.email,
        updated_by:    profile.id,
        team:          profile.team,
        updated_at:    now,
        completed_at:  isDone ? now : null,
      }, { onConflict: 'player_id,category' })
      .select().single()

    if (err) { setError(err.message); setSaving(false); return }

    await supabase.from('task_audit_log').insert({
      task_id:         data.id,
      player_id:       player.player_id,
      category,
      changed_by:      profile.id,
      changed_by_name: profile.full_name || profile.email,
      changed_by_team: profile.team,
      old_status:      task?.status || null,
      new_status:      status,
      source_urls:     urls,
      notes,
    })

    onSaved(data as PlayerTask)
    setSaving(false)
    setOpen(false)
  }

  const finp: React.CSSProperties = {
    width: '100%', background: tk.bgInput, border: `1px solid ${tk.borderLight}`,
    borderRadius: '8px', padding: '9px 12px', color: '#fff', fontSize: '13px',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <>
      {readonly ? (
        <span style={{ background: sc.bg, color: sc.text, fontSize: '11px', fontWeight: 600,
          padding: '3px 9px', borderRadius: '99px', whiteSpace: 'nowrap',
          display: 'inline-block', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task?.status || 'Pending'}
        </span>
      ) : (
        <button onClick={() => setOpen(true)}
          style={{ background: sc.bg, color: sc.text, fontSize: '11px', fontWeight: 600,
            padding: '3px 9px', borderRadius: '99px', border: 'none', cursor: 'pointer',
            whiteSpace: 'nowrap', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task?.status || 'Pending'}
        </button>
      )}

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div style={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius: '16px',
            padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <h3 style={{ color: '#fff', fontWeight: 700, margin: '0 0 4px', fontSize: '15px' }}>{category}</h3>
                <p style={{ color: tk.textMuted, fontSize: '12px', margin: 0 }}>{player.full_name} · ID {player.player_id}</p>
              </div>
              <button onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: tk.textDim, cursor: 'pointer', fontSize: '22px' }}>×</button>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', color: tk.textMuted, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as Status)} style={finp}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: tk.textMuted, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Add notes…" style={{ ...finp, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {error && (
              <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
                <p style={{ color: '#fca5a5', fontSize: '12px', margin: 0 }}>⚠️ {error}</p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setOpen(false)}
                style={{ background: tk.bgInput, border: `1px solid ${tk.borderLight}`, color: tk.textMuted, padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={save} disabled={saving}
                style={{ background: '#f97316', border: 'none', color: '#fff', fontWeight: 600, padding: '9px 22px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
interface Props { profile: UserProfile }

export default function PlayersList({ profile }: Props) {
  const supabase = createClient()
  const theme = useTheme()
  const tk    = T[theme]

  // State
  const [tournaments,      setTournaments]      = useState<TournamentMeta[]>([])
  const [tournamentsReady, setTournamentsReady] = useState(false)
  const [players,          setPlayers]          = useState<Player[]>([])
  const [tasks,            setTasks]            = useState<Record<string, PlayerTask>>({})
  const [total,            setTotal]            = useState(0)
  const [page,             setPage]             = useState(1)
  const [loading,          setLoading]          = useState(false)
  const [selected,         setSelected]         = useState<Set<number>>(new Set())
  const [claiming,         setClaiming]         = useState(false)
  const [claimMsg,         setClaimMsg]         = useState<string | null>(null)
  const [subTab,           setSubTab]           = useState<'available' | 'claimed' | 'completed'>('available')
  const [editingUrl,       setEditingUrl]       = useState<Record<string, string>>({})
  const [savingUrl,        setSavingUrl]        = useState<number | null>(null)
  const DONE_STATUSES_LOCAL: Status[] = ['Yes', 'Already Updated', 'Not Found On Any Source', 'Player Not Found Online', 'Blocked']

  // Filters
  const [search,           setSearch]           = useState('')
  const [filterGender,     setFilterGender]     = useState<'All' | '1' | '2'>('All')
  const [filterStatus,     setFilterStatus]     = useState<Status | 'All'>('All')
  const [filterCat,        setFilterCat]        = useState<Category | 'All'>('All')
  const [filterTournament, setFilterTournament] = useState<string>('') // '' = my active, specific = one

  // Step 1: Load tournaments — use sessionStorage cache to avoid re-fetching on tab switch
  useEffect(() => {
    async function loadTournaments() {
      // Check session cache first (valid for 5 minutes)
      try {
        const cached = sessionStorage.getItem('tournaments_cache')
        if (cached) {
          const { data, ts } = JSON.parse(cached)
          if (Date.now() - ts < 5 * 60 * 1000) {
            setTournaments(data)
            setTournamentsReady(true)
            return
          }
        }
      } catch {}

      const { data } = await supabase
        .from('tournament_overview')
        .select('tournament_name, assigned_team, profile_pic_team, is_active')
      const result = (data || []) as TournamentMeta[]
      setTournaments(result)
      setTournamentsReady(true)

      // Cache for 5 minutes
      try {
        sessionStorage.setItem('tournaments_cache', JSON.stringify({ data: result, ts: Date.now() }))
      } catch {}
    }
    loadTournaments()
  }, [supabase])

  // Admin = role is admin OR team is Admin
  const isAdmin = profile.role === 'admin' || profile.team === 'Admin'

  // Tournaments visible to this user (assigned to their team, active only)
  const myActiveTournaments = tournaments.filter(t =>
    (isAdmin || t.assigned_team === profile.team) &&
    t.is_active !== false
  )

  // All tournaments for admin filter dropdown
  const activeTournaments = tournaments.filter(t => t.is_active !== false)

  // Step 2: Fetch players — only after tournaments are loaded
  useEffect(() => {
    if (!tournamentsReady) return

    async function fetchPlayers() {
      setLoading(true)
      setSelected(new Set())

      const CORE_CATS = ['Date of Birth', 'Height & Weight', 'Hometown Update']

      // ── Step 1: Determine player_ids from player_tasks based on sub-tab ──
      // This ensures pagination is accurate — we query tasks DB-first, not players-first

      let eligiblePlayerIds: number[] | null = null // null = no restriction from tasks

      // ── Run all task pre-queries in PARALLEL ──────────────────────────────
      let claimedQuery = supabase
        .from('player_tasks')
        .select('player_id, category, status')
        .in('category', CORE_CATS)
        .not('operator_id', 'is', null)
      if (!isAdmin) claimedQuery = claimedQuery.eq('operator_id', profile.id)

      const [
        { data: claimedTasks },
        { data: claimedAny   },
        { data: doneTasks    },
      ] = await Promise.all([
        // Claimed tasks (for 'claimed' tab)
        claimedQuery,
        // Any claimed player ids (for 'available' exclusion)
        supabase.from('player_tasks').select('player_id').in('category', CORE_CATS).not('operator_id', 'is', null),
        // Done tasks (for 'completed' and 'available' exclusion)
        supabase.from('player_tasks').select('player_id, category, status').in('category', CORE_CATS).not('status', 'in', '(Pending,In Progress)'),
      ])

      if (subTab === 'claimed') {
        if (!claimedTasks || claimedTasks.length === 0) {
          setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
        }
        const byPlayer: Record<number, { statuses: string[] }> = {}
        claimedTasks.forEach((t: any) => {
          if (!byPlayer[t.player_id]) byPlayer[t.player_id] = { statuses: [] }
          byPlayer[t.player_id].statuses.push(t.status)
        })
        eligiblePlayerIds = Object.entries(byPlayer)
          .filter(([, v]) => !CORE_CATS.every(() =>
            v.statuses.every(s => DONE_STATUSES_LOCAL.includes(s as Status))
          ))
          .map(([id]) => parseInt(id))
        if (eligiblePlayerIds.length === 0) {
          setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
        }

      } else if (subTab === 'available') {
        const claimedIds = new Set((claimedAny || []).map((t: any) => t.player_id))
        const doneByPlayer: Record<number, Set<string>> = {}
        ;(doneTasks || []).forEach((t: any) => {
          if (!doneByPlayer[t.player_id]) doneByPlayer[t.player_id] = new Set()
          doneByPlayer[t.player_id].add(t.category)
        })
        const fullyDoneIds = new Set(
          Object.entries(doneByPlayer)
            .filter(([, cats]) => CORE_CATS.every(c => cats.has(c)))
            .map(([id]) => parseInt(id))
        )
        ;(fetchPlayers as any)._excludeIds = new Set([...Array.from(claimedIds), ...Array.from(fullyDoneIds)])

      } else if (subTab === 'completed') {
        const doneByPlayer: Record<number, Set<string>> = {}
        ;(doneTasks || []).forEach((t: any) => {
          if (!doneByPlayer[t.player_id]) doneByPlayer[t.player_id] = new Set()
          doneByPlayer[t.player_id].add(t.category)
        })
        eligiblePlayerIds = Object.entries(doneByPlayer)
          .filter(([, cats]) => CORE_CATS.every(c => cats.has(c)))
          .map(([id]) => parseInt(id))
        if (eligiblePlayerIds.length === 0) {
          setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
        }
      }

      // ── Step 2: Build tournament name filter ──
      let tournamentNames: string[] | null = null
      let includeNull = false

      if (filterTournament === '') {
        if (myActiveTournaments.length === 0 && !isAdmin) {
          setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
        }
        if (!isAdmin) {
          tournamentNames = myActiveTournaments.map(t => t.tournament_name).filter(Boolean) as string[]
          includeNull     = myActiveTournaments.some(t => t.tournament_name === null)
        } else {
          const assignedTours = tournaments.filter(t => t.assigned_team !== null)
          if (assignedTours.length === 0) {
            setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
          }
          tournamentNames = assignedTours.map(t => t.tournament_name).filter(Boolean) as string[]
          includeNull     = assignedTours.some(t => t.tournament_name === null)
        }
      } else if (filterTournament === 'NULL') {
        includeNull = true
      } else {
        tournamentNames = [filterTournament]
      }

      // ── Step 3: Query players with all filters ──
      let q = supabase.from('players').select(
        'player_id,full_name,club_sweater_num,player_gender,height,weight,most_team_id,team_ids,last_team_id,last_team_name,player_last_match_name,player_last_match_tournament_name,player_last_match_season_name',
        { count: 'exact' }
      )

      // Tournament filter
      if (includeNull && tournamentNames && tournamentNames.length > 0) {
        q = q.or(`player_last_match_tournament_name.in.(${tournamentNames.map(n => `"${n}"`).join(',')}),player_last_match_tournament_name.is.null`)
      } else if (includeNull) {
        q = q.is('player_last_match_tournament_name', null)
      } else if (tournamentNames && tournamentNames.length > 0) {
        q = q.in('player_last_match_tournament_name', tournamentNames)
      }

      // Eligible player_ids filter (from task query above)
      if (eligiblePlayerIds !== null) {
        if (eligiblePlayerIds.length === 0) {
          setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
        }
        q = q.in('player_id', eligiblePlayerIds)
      }

      // For Available tab: push excludeIds into DB query for accurate pagination
      const excludeIds: Set<number> = (fetchPlayers as any)._excludeIds || new Set()
      ;(fetchPlayers as any)._excludeIds = undefined

      if (subTab === 'available' && excludeIds.size > 0) {
        const excArr = Array.from(excludeIds)
        const CHUNK  = 500
        q = q.not('player_id', 'in', `(${excArr.slice(0, CHUNK).join(',')})`)
      }

      if (search)                 q = q.ilike('full_name', `%${search}%`)
      if (filterGender !== 'All') q = q.eq('player_gender', parseInt(filterGender))

      const from = (page - 1) * PAGE
      const { data, count } = await q
        .order('player_last_match_tournament_name', { ascending: true, nullsFirst: false })
        .order('last_team_name',                     { ascending: true, nullsFirst: false })
        .order('player_gender',                      { ascending: true, nullsFirst: false })
        .order('player_last_match_name',             { ascending: true, nullsFirst: false })
        .range(from, from + PAGE - 1)

      const playerList = (data as Player[]) || []

      // ── Step 4: Fetch tasks for display ──
      const taskMap: Record<string, PlayerTask> = {}
      if (playerList.length > 0) {
        const ids = playerList.map(p => p.player_id)
        let tq = supabase.from('player_tasks').select('*').in('player_id', ids)
        if (filterCat !== 'All') tq = tq.eq('category', filterCat)
        const { data: taskData } = await tq
        ;(taskData || []).forEach((t: PlayerTask) => {
          taskMap[`${t.player_id}__${t.category}`] = t
        })
      }

      // Status filter (secondary)
      let finalPlayers = playerList
      if (filterStatus !== 'All') {
        const matchIds = new Set(
          Object.values(taskMap).filter(t => t.status === filterStatus).map(t => t.player_id)
        )
        finalPlayers = playerList.filter(p => matchIds.has(p.player_id))
      }

      setTasks(taskMap)
      setPlayers(finalPlayers)
      setTotal(count || 0)
      setLoading(false)
    }

    fetchPlayers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentsReady, page, search, filterGender, filterStatus, filterCat, filterTournament, subTab])

  useEffect(() => { setPage(1) }, [search, filterGender, filterStatus, filterCat, filterTournament, subTab])

  function handleTaskSaved(updated: PlayerTask) {
    setTasks(prev => ({ ...prev, [`${updated.player_id}__${updated.category}`]: updated }))
  }

  // Bulk claim — set operator and move to In Progress
  async function claimSelected() {
    if (selected.size === 0) return
    setClaiming(true); setClaimMsg(null)
    const now  = new Date().toISOString()
    const ids  = Array.from(selected)
    const operatorLabel = profile.full_name || profile.email
    const upserts: any[] = []

    const CORE_CATS: Category[] = ['Date of Birth', 'Height & Weight', 'Hometown Update']
    for (const pid of ids) {
      for (const cat of CORE_CATS) {
        const existing = tasks[`${pid}__${cat}`]
        // Only claim tasks that haven't been claimed yet
        if (!existing || existing.status === 'Pending' || !existing.operator_id) {
          upserts.push({
            player_id:     pid,
            category:      cat,
            status:        'In Progress',
            assigned_to:   profile.id,
            operator_id:   profile.id,
            operator_name: operatorLabel,
            updated_by:    profile.id,
            team:          profile.team,
            updated_at:    now,
          })
        }
      }
    }

    if (upserts.length > 0) {
      const { error } = await supabase.from('player_tasks')
        .upsert(upserts, { onConflict: 'player_id,category' })
      if (error) console.error('Claim error:', error)
    }

    // Refresh tasks for claimed players
    const { data: taskData } = await supabase
      .from('player_tasks').select('*').in('player_id', ids)
    const newTasks = { ...tasks }
    ;(taskData || []).forEach((t: PlayerTask) => {
      newTasks[`${t.player_id}__${t.category}`] = t
    })
    setTasks(newTasks)

    // Remove claimed players from Available view immediately (no tab switch, no blank page)
    setPlayers(prev => prev.filter(p => !new Set(ids).has(p.player_id)))
    setTotal(prev => Math.max(0, prev - ids.length))
    setClaimMsg(`✅ Claimed ${ids.length} player${ids.length > 1 ? 's' : ''} — check the Claimed tab`)
    setSelected(new Set())
    setClaiming(false)
  }

  // Unclaim — reset tasks back to Pending/unclaimed
  // mode: 'selected' = only checked rows, 'all' = ALL claimed by me (across all pages)
  async function unclaim(mode: 'selected' | 'all') {
    setClaiming(true); setClaimMsg(null)
    const CORE_CATS = ['Date of Birth', 'Height & Weight', 'Hometown Update']
    const now = new Date().toISOString()

    if (mode === 'all') {
      // Reset ALL tasks claimed by this operator across all pages
      const { error } = await supabase.from('player_tasks')
        .update({ status: 'Pending', operator_id: null, operator_name: null, assigned_to: null, updated_at: now })
        .eq('operator_id', profile.id)
        .in('category', CORE_CATS)
        .in('status', ['In Progress', 'Pending'])  // include Pending too
      if (error) console.error('Unclaim all error:', error)
      setClaimMsg('↩️ All your claimed jobs moved back to Available')
    } else {
      const ids = Array.from(selected)
      if (ids.length === 0) { setClaiming(false); return }
      const { error } = await supabase.from('player_tasks')
        .update({ status: 'Pending', operator_id: null, operator_name: null, assigned_to: null, updated_at: now })
        .eq('operator_id', profile.id)
        .in('player_id', ids)
        .in('category', CORE_CATS)
      if (error) console.error('Unclaim selected error:', error)
      setClaimMsg(`↩️ ${ids.length} player${ids.length > 1 ? 's' : ''} moved back to Available`)
    }

    setSelected(new Set())
    setClaiming(false)
    setPage(1)
    setSubTab('available')
  }

  function toggleSelect(id: number) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSelected(selected.size === players.length ? new Set() : new Set(players.map(p => p.player_id)))
  }

  const totalPages = Math.ceil(total / PAGE)

  const inp: React.CSSProperties = {
    background: tk.bgInput, border: `1px solid ${tk.borderLight}`, borderRadius: '8px',
    padding: '7px 11px', color: tk.text, fontSize: '12px', outline: 'none',
  }
  const th: React.CSSProperties = {
    padding: '9px 10px', color: tk.textDim, fontSize: '10px', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left',
    background: tk.tableHead, borderBottom: `1px solid ${tk.border}`, whiteSpace: 'nowrap',
    position: 'sticky', top: 0, zIndex: 10,
  }
  const td: React.CSSProperties = {
    padding: '9px 10px', borderBottom: `1px solid ${tk.tableRow}`,
    fontSize: '12px', color: tk.textMuted, verticalAlign: 'middle',
  }

  async function saveUrl(playerId: number, existingUrls: string[], isReplace = false) {
    setSavingUrl(playerId)
    // isReplace=true means existingUrls IS the new list (edit/delete mode)
    // isReplace=false means we append the typed URL to existingUrls
    let newUrls: string[]
    if (isReplace) {
      newUrls = existingUrls
    } else {
      const url = editingUrl[playerId]?.trim()
      if (!url) { setSavingUrl(null); return }
      newUrls = existingUrls.includes(url) ? existingUrls : [...existingUrls, url]
    }

    // Update all 3 core task categories for this player with the new URLs
    const catsToUpdate = ['Date of Birth', 'Height & Weight', 'Hometown Update'] as const
    for (const cat of catsToUpdate) {
      const task = tasks[`${playerId}__${cat}`]
      if (task) {
        await supabase.from('player_tasks')
          .update({ source_urls: newUrls, updated_at: new Date().toISOString() })
          .eq('player_id', playerId).eq('category', cat)
      }
    }

    // Update local state
    setTasks(prev => {
      const updated = { ...prev }
      catsToUpdate.forEach(c => {
        const k = `${playerId}__${c}`
        if (updated[k]) updated[k] = { ...updated[k], source_urls: newUrls }
      })
      return updated
    })
    // Clear the add-new input
    setEditingUrl(prev => { const n = { ...prev }; delete n[playerId]; return n })
    setSavingUrl(null)
  }

  if (!tournamentsReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', color: tk.textDim }}>
        Loading tournament assignments…
      </div>
    )
  }

  if (!isAdmin && myActiveTournaments.length === 0) {
    return (
      <div style={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius: '12px', padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏆</div>
        <h3 style={{ color: '#fff', fontWeight: 600, margin: '0 0 8px' }}>No Active Tournaments Assigned</h3>
        <p style={{ color: tk.textDim, fontSize: '13px', margin: 0 }}>
          Ask your admin to assign active tournaments to <strong style={{ color: '#f97316' }}>{profile.team}</strong>.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {([
          { key: 'available', label: '📋 Available', color: tk.borderLight,  desc: 'Unclaimed players — select and claim a batch' },
          { key: 'claimed',   label: '🙋 Claimed',   color: '#1d4ed8',  desc: 'Your active work — update statuses here' },
          { key: 'completed', label: '✅ Completed',  color: '#15803d',  desc: 'DOB + Ht/Wt + Hometown all resolved' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600,
              background: subTab === t.key ? t.color : tk.bgInput,
              color: subTab === t.key ? '#fff' : tk.textMuted }}>
            {t.label}
          </button>
        ))}
        <span style={{ color: tk.textDim, fontSize: '12px', marginLeft: '4px' }}>
          {subTab === 'available' ? 'Unclaimed players — select and claim a batch' :
           subTab === 'claimed'   ? `Your active work (${profile.full_name || profile.email})` :
           'DOB + Ht/Wt + Hometown all resolved'}
        </span>
      </div>

      {/* Filters */}
      <div style={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius: '12px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>

          <input type="text" placeholder="🔍 Search player name…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ ...inp, minWidth: '180px', flex: 1 }} />

          {/* Tournament selector */}
          <select value={filterTournament} onChange={e => setFilterTournament(e.target.value)}
            style={{ ...inp, maxWidth: '240px' }}>
            <option value="">
              {isAdmin ? 'All Active Tournaments' : `My Tournaments (${profile.team})`}
            </option>
            {isAdmin ? (
              <>
                <optgroup label="── Cairo ──">
                  {activeTournaments.filter(t => t.assigned_team === 'Cairo').map(t => (
                    <option key={t.tournament_name ?? 'NULL'} value={t.tournament_name ?? 'NULL'}>
                      {t.tournament_name ?? '(No Tournament)'}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="── India ──">
                  {activeTournaments.filter(t => t.assigned_team === 'India').map(t => (
                    <option key={t.tournament_name ?? 'NULL'} value={t.tournament_name ?? 'NULL'}>
                      {t.tournament_name ?? '(No Tournament)'}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="── Unassigned ──">
                  {activeTournaments.filter(t => !t.assigned_team).map(t => (
                    <option key={t.tournament_name ?? 'NULL'} value={t.tournament_name ?? 'NULL'}>
                      {t.tournament_name ?? '(No Tournament)'}
                    </option>
                  ))}
                </optgroup>
              </>
            ) : (
              myActiveTournaments.map(t => (
                <option key={t.tournament_name ?? 'NULL'} value={t.tournament_name ?? 'NULL'}>
                  {t.tournament_name ?? '(No Tournament)'}
                </option>
              ))
            )}
          </select>

          <select value={filterGender} onChange={e => setFilterGender(e.target.value as any)} style={inp}>
            <option value="All">All Genders</option>
            <option value="1">Male</option>
            <option value="2">Female</option>
          </select>

          <select value={filterCat} onChange={e => setFilterCat(e.target.value as any)} style={inp}>
            <option value="All">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} style={inp}>
            <option value="All">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <button onClick={() => { setSearch(''); setFilterGender('All'); setFilterCat('All'); setFilterStatus('All'); setFilterTournament('') }}
            style={{ background: 'none', border: 'none', color: tk.textDim, cursor: 'pointer', fontSize: '12px' }}>Clear</button>

          <button onClick={() => { setPage(1); }}
            title="Refresh current view"
            style={{ background: tk.bgInput, border: `1px solid ${tk.border}`, color: tk.textMuted,
              padding: '5px 10px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
            🔄
          </button>

          <span style={{ color: tk.textFaint, fontSize: '12px', marginLeft: 'auto' }}>
            {loading ? 'Loading…' : `${total.toLocaleString('en-US')} players`}
          </span>
        </div>

        {/* Claimed tab controls */}
        {subTab === 'claimed' && (
          <div style={{ marginTop: '10px', padding: '10px 14px', background: '#1c1917', borderRadius: '8px',
            border: '1px solid #44403c', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ color: '#a8a29e', fontSize: '12px' }}>
              {selected.size > 0 ? `${selected.size} selected` : 'Your claimed jobs — update statuses with the dropdowns'}
            </span>
            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
              {selected.size > 0 && (
                <button onClick={() => unclaim('selected')} disabled={claiming}
                  style={{ background: '#7c3aed', border: 'none', color: '#fff', fontWeight: 600, fontSize: '12px',
                    padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', opacity: claiming ? 0.6 : 1 }}>
                  {claiming ? '…' : `↩️ Unclaim Selected (${selected.size})`}
                </button>
              )}
              <button onClick={() => unclaim('all')} disabled={claiming}
                style={{ background: tk.borderLight, border: '1px solid #4b5563', color: tk.textMuted, fontWeight: 600, fontSize: '12px',
                  padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', opacity: claiming ? 0.6 : 1 }}>
                {claiming ? '…' : '↩️ Move ALL My Claimed → Available'}
              </button>
            </div>
            {claimMsg && <span style={{ color: '#86efac', fontSize: '12px' }}>{claimMsg}</span>}
          </div>
        )}

        {/* Claim bar — only in Available tab */}
        {subTab === 'available' && selected.size > 0 && (
          <div style={{ marginTop: '10px', padding: '10px 14px', background: '#1e3a5f', borderRadius: '8px',
            border: '1px solid #1d4ed8', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ color: '#93c5fd', fontSize: '13px', fontWeight: 600 }}>
              {selected.size} player{selected.size > 1 ? 's' : ''} selected
            </span>
            <button onClick={claimSelected} disabled={claiming}
              style={{ background: '#f97316', border: 'none', color: '#fff', fontWeight: 700, fontSize: '13px',
                padding: '7px 18px', borderRadius: '8px', cursor: 'pointer', opacity: claiming ? 0.6 : 1 }}>
              {claiming ? 'Claiming…' : `🙋 Claim ${selected.size} player${selected.size > 1 ? 's' : ''} →`}
            </button>
            <button onClick={() => setSelected(new Set())}
              style={{ background: 'none', border: `1px solid ${tk.borderLight}`, color: tk.textMuted, fontSize: '12px',
                padding: '6px 12px', borderRadius: '8px', cursor: 'pointer' }}>Deselect all</button>
            {claimMsg && <span style={{ color: '#86efac', fontSize: '12px' }}>{claimMsg}</span>}
          </div>
        )}
        {claimMsg && selected.size === 0 && (
          <p style={{ color: '#86efac', fontSize: '12px', margin: '8px 0 0' }}>{claimMsg}</p>
        )}
      </div>

      {/* Table */}
      <div style={{ background: tk.bg, border: `1px solid ${tk.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1800px' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: '36px', textAlign: 'center' }}>
                  <input type="checkbox" checked={players.length > 0 && selected.size === players.length}
                    onChange={toggleAll} style={{ accentColor: '#f97316', cursor: 'pointer' }} />
                </th>
                <th style={th}>Player ID</th>
                <th style={{ ...th, textAlign: 'center', width: '60px' }}>Photo</th>
                <th style={th}>Full Name</th>
                <th style={th}>#</th>
                <th style={th}>Gender</th>
                <th style={th}>Ht</th>
                <th style={th}>Wt</th>
                <th style={th}>Most Team</th>
                <th style={th}>Team IDs</th>
                <th style={th}>Last Team</th>
                <th style={th}>Last Match</th>
                <th style={th}>Tournament</th>
                <th style={th}>Season</th>
                <th style={th}>Operator</th>
                <th style={th}>Source URL</th>
                <th style={{ ...th, borderLeft: '2px solid #374151' }}>🎂 DOB</th>
                <th style={th}>📏 Ht/Wt</th>
                <th style={th}>🏠 Hometown</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: (subTab === 'completed' && !isAdmin) ? 19 : 20 }).map((_, j) => (
                    <td key={j} style={td}><div style={{ height: '12px', background: tk.tableHead, borderRadius: '4px' }} /></td>
                  ))}</tr>
                ))
              ) : players.length === 0 ? (
                <tr>
                  <td colSpan={(subTab === 'completed' && !isAdmin) ? 19 : 20} style={{ ...td, textAlign: 'center', color: tk.textFaint, padding: '48px' }}>
{subTab === 'available' ? 'No unclaimed players — all have been claimed or completed! 🎉' :
                       subTab === 'claimed'   ? `No active claimed players for ${profile.full_name || profile.email}` :
                       'No completed players yet'}
                  </td>
                </tr>
              ) : players.map(player => {
                const dobTask = tasks[`${player.player_id}__Date of Birth`]
                const htwTask = tasks[`${player.player_id}__Height & Weight`]
                const htnTask = tasks[`${player.player_id}__Hometown Update`]
                const isSelected = selected.has(player.player_id)
                const operatorName = dobTask?.operator_name || htwTask?.operator_name || htnTask?.operator_name || null
                const allDone = [dobTask, htwTask, htnTask].every(t => t && DONE_STATUSES.includes(t.status))

                return (
                  <tr key={player.player_id}
                    style={{ background: isSelected ? 'rgba(249,115,22,0.1)' : allDone ? 'rgba(21,128,61,0.06)' : 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = tk.rowHover }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = allDone ? 'rgba(21,128,61,0.06)' : 'transparent' }}>

                    {(subTab === 'available' || subTab === 'claimed' || (subTab === 'completed' && isAdmin)) && (
                      <td style={{ ...td, textAlign: 'center' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(player.player_id)}
                          style={{ accentColor: '#f97316', cursor: 'pointer' }} />
                      </td>
                    )}

                    {/* Player ID — click number to copy, ↗ to open */}
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <span
                          onClick={() => { navigator.clipboard.writeText(String(player.player_id)) }}
                          title="Click to copy ID"
                          style={{ color: '#f97316', fontWeight: 700, fontFamily: 'monospace', fontSize: '11px',
                            cursor: 'pointer', textDecoration: 'underline dotted' }}>
                          {player.player_id}
                        </span>
                        <a href={`https://data.instatfootball.tv/hockeyplayers?dbs_id=${player.player_id}`}
                          target="_blank" rel="noreferrer"
                          style={{ color: '#f97316', textDecoration: 'none', fontSize: '11px' }} title="Open in Instat">↗</a>
                      </div>
                    </td>

                    {/* Photo */}
                    <td style={{ ...td, textAlign: 'center', width: '60px' }}>
                      <a href={`https://hockey.instatscout.com/images/players/180/${player.player_id}.png`}
                        target="_blank" rel="noreferrer" title="View full image">
                        <img
                          src={`https://hockey.instatscout.com/images/players/180/${player.player_id}.png`}
                          alt={player.full_name}
                          onError={e => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(player.full_name)}&size=40&background=374151&color=9ca3af&bold=true&rounded=true`
                          }}
                          style={{ width: '38px', height: '38px', borderRadius: '50%',
                            objectFit: 'cover', border: `2px solid ${tk.border}`,
                            display: 'block', margin: '0 auto' }}
                        />
                      </a>
                    </td>

                    {/* Full Name — click to Google search "Name + Team" */}
                    <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(`${player.full_name} ${player.last_team_name || ''}`.trim())}`}
                        target="_blank" rel="noreferrer"
                        title={`Google: ${player.full_name} ${player.last_team_name || ''}`}
                        style={{ color: tk.text, textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                        {player.full_name}
                      </a>
                    </td>

                    <td style={{ ...td, textAlign: 'center' }}>
                      {player.club_sweater_num != null
                        ? <span style={{ background: tk.tableHead, padding: '2px 6px', borderRadius: '4px', fontWeight: 600, color: tk.text, fontSize: '11px' }}>{player.club_sweater_num}</span>
                        : <span style={{ color: tk.borderLight }}>—</span>}
                    </td>

                    <td style={td}>
                      {player.player_gender != null
                        ? <span style={{ color: player.player_gender === 1 ? '#60a5fa' : '#f472b6', fontSize: '11px', fontWeight: 600 }}>
                            {GENDER_MAP[player.player_gender] || player.player_gender}
                          </span>
                        : <span style={{ color: tk.borderLight }}>—</span>}
                    </td>

                    <td style={{ ...td, fontSize: '11px' }}>{player.height != null ? player.height : <span style={{ color: tk.borderLight }}>—</span>}</td>
                    <td style={{ ...td, fontSize: '11px' }}>{player.weight != null ? player.weight : <span style={{ color: tk.borderLight }}>—</span>}</td>

                    <td style={{ ...td, color: tk.textMuted, fontFamily: 'monospace', fontSize: '11px' }}>
                      {player.most_team_id ?? <span style={{ color: tk.borderLight }}>—</span>}
                    </td>

                    <td style={{ ...td, textAlign: 'center' }}>
                      <TeamIdsCell val={player.team_ids} />
                    </td>

                    <td style={{ ...td, whiteSpace: 'nowrap', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {player.last_team_id || player.last_team_name
                        ? <span>
                            {player.last_team_id && <span style={{ color: tk.textDim, fontFamily: 'monospace', fontSize: '10px' }}>{player.last_team_id} </span>}
                            <span style={{ color: tk.text }}>{player.last_team_name || ''}</span>
                          </span>
                        : <span style={{ color: tk.borderLight }}>—</span>}
                    </td>

                    <td style={{ ...td, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={player.player_last_match_name || ''}>
                      {player.player_last_match_name || <span style={{ color: tk.borderLight }}>—</span>}
                    </td>

                    <td style={{ ...td, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={player.player_last_match_tournament_name || ''}>
                      {player.player_last_match_tournament_name
                        ? <span style={{ color: '#a78bfa', fontSize: '11px' }}>{player.player_last_match_tournament_name}</span>
                        : <span style={{ color: tk.borderLight, fontStyle: 'italic', fontSize: '11px' }}>—</span>}
                    </td>

                    <td style={{ ...td, whiteSpace: 'nowrap', fontSize: '11px', color: tk.textMuted }}>
                      {player.player_last_match_season_name || <span style={{ color: tk.borderLight }}>—</span>}
                    </td>

                    <td style={td}>
                      {operatorName
                        ? <span style={{ background: '#1e3a5f', color: '#93c5fd', fontSize: '11px', fontWeight: 600,
                            padding: '2px 8px', borderRadius: '99px', whiteSpace: 'nowrap' }}>
                            👤 {operatorName}
                          </span>
                        : <span style={{ color: tk.borderLight, fontSize: '11px' }}>—</span>}
                    </td>

                    {/* Source URL — with add + edit per URL */}
                    <td style={{ ...td, minWidth: '200px' }}>
                      {(() => {
                        const allUrls = Array.from(new Set([
                          ...(tasks[`${player.player_id}__Date of Birth`]?.source_urls || []),
                          ...(tasks[`${player.player_id}__Height & Weight`]?.source_urls || []),
                          ...(tasks[`${player.player_id}__Hometown Update`]?.source_urls || []),
                        ]))
                        const urlVal = editingUrl[String(player.player_id)] ?? ''
                        const editKey = `edit_${player.player_id}`
                        const editIdx = editingUrl[editKey] !== undefined ? parseInt(editingUrl[editKey] as string) : -1
                        return (
                          <>
                            {allUrls.map((u, i) => (
                              editIdx === i ? (
                                /* Inline edit mode */
                                <div key={i} style={{ display: 'flex', gap: '3px', marginBottom: '3px' }}>
                                  <input
                                    type="url"
                                    defaultValue={u}
                                    autoFocus
                                    id={`edit-url-${player.player_id}-${i}`}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        const val = (e.target as HTMLInputElement).value.trim()
                                        if (val) {
                                          const updated = allUrls.map((x, j) => j === i ? val : x)
                                          saveUrl(player.player_id, updated, true)
                                        }
                                        setEditingUrl(prev => { const n = {...prev}; delete n[editKey]; return n })
                                      }
                                      if (e.key === 'Escape') setEditingUrl(prev => { const n = {...prev}; delete n[editKey]; return n })
                                    }}
                                    style={{ flex: 1, background: '#1d4ed8', border: '1px solid #3b82f6',
                                      borderRadius: '4px', padding: '3px 6px', color: '#fff', fontSize: '10px', outline: 'none', minWidth: 0 }}
                                  />
                                  <button
                                    onClick={() => {
                                      const el = document.getElementById(`edit-url-${player.player_id}-${i}`) as HTMLInputElement
                                      const val = el?.value.trim()
                                      if (val) {
                                        const updated = allUrls.map((x, j) => j === i ? val : x)
                                        saveUrl(player.player_id, updated, true)
                                      }
                                      setEditingUrl(prev => { const n = {...prev}; delete n[editKey]; return n })
                                    }}
                                    style={{ background: '#15803d', border: 'none', color: '#fff', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer', fontSize: '10px' }}>
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => setEditingUrl(prev => { const n = {...prev}; delete n[editKey]; return n })}
                                    style={{ background: tk.borderLight, border: 'none', color: tk.textMuted, borderRadius: '4px', padding: '3px 5px', cursor: 'pointer', fontSize: '10px' }}>
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                /* View mode with edit icon */
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '2px' }}>
                                  <a href={u} target="_blank" rel="noreferrer"
                                    style={{ color: '#60a5fa', fontSize: '10px', textDecoration: 'none',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}
                                    title={u}>
                                    🔗 {u.replace(/^https?:\/\//, '').substring(0, 22)}…
                                  </a>
                                  <button
                                    onClick={() => setEditingUrl(prev => ({ ...prev, [editKey]: String(i) }))}
                                    title="Edit this URL"
                                    style={{ background: 'none', border: 'none', color: tk.textFaint, cursor: 'pointer',
                                      fontSize: '11px', padding: '1px 3px', flexShrink: 0, lineHeight: 1 }}>
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => saveUrl(player.player_id, allUrls.filter((_, j) => j !== i), true)}
                                    title="Remove this URL"
                                    style={{ background: 'none', border: 'none', color: tk.textFaint, cursor: 'pointer',
                                      fontSize: '10px', padding: '1px 3px', flexShrink: 0, lineHeight: 1 }}>
                                    ✕
                                  </button>
                                </div>
                              )
                            ))}
                            {/* Add new URL input */}
                            <div style={{ display: 'flex', gap: '3px', marginTop: allUrls.length > 0 ? '4px' : '0' }}>
                              <input
                                type="url"
                                value={urlVal}
                                onChange={e => setEditingUrl(prev => ({ ...prev, [String(player.player_id)]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveUrl(player.player_id, allUrls) } }}
                                placeholder="Paste source URL…"
                                style={{ flex: 1, background: tk.tableRow, border: `1px solid ${tk.border}`,
                                  borderRadius: '6px', padding: '4px 8px', color: tk.textMuted,
                                  fontSize: '11px', outline: 'none', minWidth: 0 }}
                              />
                              {urlVal && (
                                <button
                                  onClick={() => saveUrl(player.player_id, allUrls)}
                                  disabled={savingUrl === player.player_id}
                                  style={{ background: '#1d4ed8', border: 'none', color: '#fff',
                                    borderRadius: '5px', padding: '4px 8px', cursor: 'pointer',
                                    fontSize: '11px', flexShrink: 0 }}>
                                  {savingUrl === player.player_id ? '…' : '＋'}
                                </button>
                              )}
                            </div>
                          </>
                        )
                      })()}
                    </td>

                    <td style={{ ...td, borderLeft: '2px solid #1f2937' }}>
                      <ProgressCell task={dobTask} category="Date of Birth" player={player} profile={profile} onSaved={handleTaskSaved} readonly={subTab === 'available'} />
                    </td>
                    <td style={td}>
                      <ProgressCell task={htwTask} category="Height & Weight" player={player} profile={profile} onSaved={handleTaskSaved} readonly={subTab === 'available'} />
                    </td>
                    <td style={td}>
                      <ProgressCell task={htnTask} category="Hometown Update" player={player} profile={profile} onSaved={handleTaskSaved} readonly={subTab === 'available'} />
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', borderTop: `1px solid ${tk.border}`, background: tk.bg }}>
          <span style={{ color: tk.textFaint, fontSize: '12px' }}>
            {loading ? '…' : `${((page-1)*PAGE+1).toLocaleString('en-US')}–${Math.min(page*PAGE,total).toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setPage(1)} disabled={page===1} style={{ ...inp, cursor:'pointer', opacity:page===1?0.3:1, padding:'5px 10px' }}>«</button>
            <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{ ...inp, cursor:'pointer', opacity:page===1?0.3:1, padding:'5px 12px' }}>‹</button>
            <span style={{ color:tk.textDim, fontSize:'12px', padding:'5px 8px' }}>{page}/{totalPages||1}</span>
            <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages} style={{ ...inp, cursor:'pointer', opacity:page>=totalPages?0.3:1, padding:'5px 12px' }}>›</button>
            <button onClick={() => setPage(totalPages)} disabled={page>=totalPages} style={{ ...inp, cursor:'pointer', opacity:page>=totalPages?0.3:1, padding:'5px 10px' }}>»</button>
          </div>
        </div>
      </div>
    </div>
  )
}
