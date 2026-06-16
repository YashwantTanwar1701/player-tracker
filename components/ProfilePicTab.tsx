'use client'
import { useTheme, T } from '@/components/Dashboard'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Player, PlayerTask, UserProfile, Status, STATUSES, STATUS_COLOR } from '@/types'

const PAGE = 50
const DONE_STATUSES: Status[] = ['Yes', 'Already Updated', 'Not Found On Any Source', 'Player Not Found Online', 'Blocked']

interface TournamentMeta {
  tournament_name:  string | null
  profile_pic_team: string | null
  is_active:        boolean | null
}

interface PlayerWithTask extends Player {
  picTask: PlayerTask | undefined
}

interface Props { profile: UserProfile }

const GENDER_MAP: Record<number, string> = { 1: 'Male', 2: 'Female' }

// Status options specifically for Profile Pic
const PIC_STATUSES: Status[] = ['Pending', 'In Progress', 'Yes', 'Already Updated', 'Not Found On Any Source', 'Player Not Found Online', 'Blocked']

export default function ProfilePicTab({ profile }: Props) {
  const supabase = createClient()
  const theme = useTheme()
  const tk    = T[theme]
  const isAdmin  = profile.role === 'admin' || profile.team === 'Admin'

  const [subTab,      setSubTab]      = useState<'available' | 'claimed' | 'completed'>('available')
  const [tournaments, setTournaments] = useState<TournamentMeta[]>([])
  const [tourReady,   setTourReady]   = useState(false)
  const [players,     setPlayers]     = useState<PlayerWithTask[]>([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(1)
  const [loading,     setLoading]     = useState(false)
  const [search,      setSearch]      = useState('')
  const [filterTour,  setFilterTour]  = useState('')
  const [selected,    setSelected]    = useState<Set<number>>(new Set())
  const [claiming,    setClaiming]    = useState(false)
  const [claimMsg,    setClaimMsg]    = useState<string | null>(null)
  const [editingUrl,  setEditingUrl]  = useState<Record<string, string>>({})
  const [savingUrl,   setSavingUrl]   = useState<number | null>(null)

  // Step 1: Load tournaments
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('tournament_overview')
        .select('tournament_name, profile_pic_team, is_active')
      setTournaments((data || []) as TournamentMeta[])
      setTourReady(true)
    }
    load()
  }, [supabase])

  // Tournaments with profile_pic_team assigned, visible to this user
  // Admin: all tournaments that have ANY profile_pic_team set + are active
  // Operator: only their team's pic tournaments
  const myTours = tournaments.filter(t =>
    t.profile_pic_team !== null &&   // must have a pic team assigned
    t.is_active !== false &&
    (isAdmin || t.profile_pic_team === profile.team)
  )

  // Step 2: Fetch players only after tournaments loaded
  useEffect(() => {
    if (!tourReady) return
    fetchPlayers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourReady, page, search, filterTour, subTab, tourReady])

  useEffect(() => { setPage(1) }, [search, filterTour, subTab])

  async function fetchPlayers() {
    setLoading(true)
    setSelected(new Set())

    if (myTours.length === 0) {
      setPlayers([]); setTotal(0); setLoading(false); return
    }

    // ── Step 1: Get eligible player_ids from player_tasks based on sub-tab ──
    let eligibleIds: number[] | null = null
    let excludeIds = new Set<number>()

    // ── Run all task pre-queries in PARALLEL ──────────────────────────────
    let claimedQuery = supabase
      .from('player_tasks')
      .select('player_id, status')
      .eq('category', 'Profile Pic Update')
      .in('status', ['Pending', 'In Progress'])
      .not('operator_id', 'is', null)
    if (!isAdmin) claimedQuery = claimedQuery.eq('operator_id', profile.id)

    const [
      { data: claimedData },
      { data: doneData    },
      { data: takenData   },
    ] = await Promise.all([
      claimedQuery,
      supabase.from('player_tasks').select('player_id').eq('category', 'Profile Pic Update').not('status', 'in', '(Pending,In Progress)'),
      supabase.from('player_tasks').select('player_id').eq('category', 'Profile Pic Update').not('operator_id', 'is', null),
    ])

    if (subTab === 'claimed') {
      eligibleIds = (claimedData || []).map((t: any) => t.player_id)
      if (eligibleIds.length === 0) { setPlayers([]); setTotal(0); setLoading(false); return }

    } else if (subTab === 'completed') {
      eligibleIds = (doneData || []).map((t: any) => t.player_id)
      if (eligibleIds.length === 0) { setPlayers([]); setTotal(0); setLoading(false); return }

    } else {
      excludeIds = new Set([
        ...(takenData || []).map((t: any) => t.player_id),
        ...(doneData  || []).map((t: any) => t.player_id),
      ])
    }

    // ── Step 2: Query players ──
    let q = supabase.from('players').select(
        'player_id,full_name,club_sweater_num,player_gender,last_team_name,player_last_match_name,player_last_match_tournament_name,player_last_match_season_name',
        { count: 'exact' }
      )
    if (search) q = q.ilike('full_name', `%${search}%`)

    // Tournament filter
    if (filterTour === '') {
      const names   = myTours.map(t => t.tournament_name).filter(Boolean) as string[]
      const hasNull = myTours.some(t => t.tournament_name === null)
      if (names.length > 0 && hasNull) {
        q = q.or(`player_last_match_tournament_name.in.(${names.map(n => `"${n}"`).join(',')}),player_last_match_tournament_name.is.null`)
      } else if (hasNull) {
        q = q.is('player_last_match_tournament_name', null)
      } else if (names.length > 0) {
        q = q.in('player_last_match_tournament_name', names)
      }
    } else if (filterTour === 'NULL') {
      q = q.is('player_last_match_tournament_name', null)
    } else {
      q = q.eq('player_last_match_tournament_name', filterTour)
    }

    if (eligibleIds !== null) {
      if (eligibleIds.length === 0) { setPlayers([]); setTotal(0); setLoading(false); return }
      q = q.in('player_id', eligibleIds)
    }

    // For Available tab: exclude claimed/done IDs directly in DB query
    // This ensures accurate count and no empty pages
    if (subTab === 'available' && excludeIds.size > 0) {
      const excArr = Array.from(excludeIds)
      // Supabase .not('player_id','in',...) supports up to ~1000 ids in one call
      // Chunk if needed
      const CHUNK = 500
      if (excArr.length <= CHUNK) {
        q = q.not('player_id', 'in', `(${excArr.join(',')})`)
      } else {
        // For very large exclude sets, use first chunk (edge case)
        q = q.not('player_id', 'in', `(${excArr.slice(0, CHUNK).join(',')})`)
      }
    }

    const from = (page - 1) * PAGE
    const { data, count } = await q
      .order('player_last_match_tournament_name', { ascending: true, nullsFirst: false })
      .order('last_team_name', { ascending: true, nullsFirst: false })
      .range(from, from + PAGE - 1)

    const playerList = (data as Player[]) || []

    // ── Step 3: Fetch pic tasks for display ──
    const taskMap: Record<number, PlayerTask> = {}
    if (playerList.length > 0) {
      const ids = playerList.map(p => p.player_id)
      const { data: taskData } = await supabase
        .from('player_tasks').select('*')
        .in('player_id', ids).eq('category', 'Profile Pic Update')
      ;(taskData || []).forEach((t: PlayerTask) => { taskMap[t.player_id] = t })
    }

    setPlayers(playerList.map(p => ({ ...p, picTask: taskMap[p.player_id] })))
    setTotal(count || 0)
    setLoading(false)
  }

  async function updateStatus(player: PlayerWithTask, status: Status) {
    const now    = new Date().toISOString()
    const isDone = !['Pending', 'In Progress'].includes(status)
    const { data, error } = await supabase.from('player_tasks')
      .upsert({
        player_id:     player.player_id,
        category:      'Profile Pic Update',
        status,
        assigned_to:   profile.id,
        operator_id:   profile.id,
        operator_name: profile.full_name || profile.email,
        updated_by:    profile.id,
        team:          profile.team,
        updated_at:    now,
        completed_at:  isDone ? now : null,
        source_urls:   player.picTask?.source_urls || [],
        notes:         player.picTask?.notes || null,
      }, { onConflict: 'player_id,category' })
      .select().single()

    if (error) { console.error(error); return }
    if (data) {
      await supabase.from('task_audit_log').insert({
        task_id:         data.id,
        player_id:       player.player_id,
        category:        'Profile Pic Update',
        changed_by:      profile.id,
        changed_by_name: profile.full_name || profile.email,
        changed_by_team: profile.team,
        old_status:      player.picTask?.status || null,
        new_status:      status,
        source_urls:     data.source_urls || [],
      })
      // Move between sub-tabs
      setPlayers(prev => prev.filter(p => {
        if (p.player_id !== player.player_id) return true
        const nowDone = !['Pending', 'In Progress'].includes(status)
        return subTab === 'completed' ? nowDone : !nowDone
      }))
    }
  }

  // Unclaim pic tasks
  async function unclaim(mode: 'selected' | 'all') {
    setClaiming(true); setClaimMsg(null)
    const now = new Date().toISOString()

    if (mode === 'all') {
      await supabase.from('player_tasks')
        .update({ status: 'Pending', operator_id: null, operator_name: null, assigned_to: null, updated_at: now })
        .eq('operator_id', profile.id)
        .eq('category', 'Profile Pic Update')
        .eq('status', 'In Progress')
      setClaimMsg('↩️ All your claimed pic jobs moved back to Available')
    } else {
      const ids = Array.from(selected)
      if (ids.length === 0) { setClaiming(false); return }
      await supabase.from('player_tasks')
        .update({ status: 'Pending', operator_id: null, operator_name: null, assigned_to: null, updated_at: now })
        .eq('operator_id', profile.id)
        .in('player_id', ids)
        .eq('category', 'Profile Pic Update')
      setClaimMsg(`↩️ ${ids.length} player${ids.length > 1 ? 's' : ''} moved back to Available`)
    }

    setSelected(new Set())
    setClaiming(false)
    setPage(1)
    setSubTab('available')
  }

  async function saveUrl(player: PlayerWithTask, newUrlsOverride?: string[]) {
    setSavingUrl(player.player_id)
    let newUrls: string[]
    if (newUrlsOverride !== undefined) {
      newUrls = newUrlsOverride
    } else {
      const url = editingUrl[String(player.player_id)]?.trim()
      if (!url) { setSavingUrl(null); return }
      const existing = player.picTask?.source_urls || []
      newUrls = existing.includes(url) ? existing : [...existing, url]
    }
    await supabase.from('player_tasks').upsert({
      player_id:   player.player_id,
      category:    'Profile Pic Update',
      source_urls: newUrls,
      updated_at:  new Date().toISOString(),
      status:      player.picTask?.status || 'Pending',
      team:        profile.team,
    }, { onConflict: 'player_id,category' })
    setPlayers(prev => prev.map(p =>
      p.player_id === player.player_id
        ? { ...p, picTask: { ...(p.picTask || {} as PlayerTask), source_urls: newUrls } }
        : p
    ))
    setEditingUrl(prev => { const n = { ...prev }; delete n[String(player.player_id)]; return n })
    setSavingUrl(null)
  }

  async function claimSelected() {
    if (selected.size === 0) return
    setClaiming(true); setClaimMsg(null)
    const ids  = Array.from(selected)
    const now  = new Date().toISOString()
    const operatorLabel = profile.full_name || profile.email
    const ups  = ids.map(pid => ({
      player_id:     pid,
      category:      'Profile Pic Update',
      status:        'In Progress' as Status,
      assigned_to:   profile.id,
      operator_id:   profile.id,
      operator_name: operatorLabel,
      updated_by:    profile.id,
      team:          profile.team,
      updated_at:    now,
    }))
    const { error } = await supabase.from('player_tasks').upsert(ups, { onConflict: 'player_id,category' })
    if (error) console.error('Claim error:', error)
    // Remove from Available immediately, stay on current tab
    setPlayers(prev => prev.filter(p => !new Set(ids).has(p.player_id)))
    setTotal(prev => Math.max(0, prev - ids.length))
    setClaimMsg(`✅ Claimed ${ids.length} player${ids.length > 1 ? 's' : ''} — check the Claimed tab`)
    setSelected(new Set())
    setClaiming(false)
  }

  const totalPages = Math.ceil(total / PAGE)

  const inp: React.CSSProperties = {
    background: tk.bgInput, border: `1px solid ${tk.borderLight}`, borderRadius: '8px',
    padding: '7px 11px', color: '#fff', fontSize: '12px', outline: 'none',
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

  if (!tourReady) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', color: tk.textDim }}>
      Loading tournaments…
    </div>
  )

  if (myTours.length === 0) return (
    <div style={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius: '12px', padding: '48px', textAlign: 'center' }}>
      <div style={{ fontSize: '32px', marginBottom: '12px' }}>📸</div>
      <h3 style={{ color: '#fff', fontWeight: 600, margin: '0 0 8px' }}>No Profile Pic Competitions Assigned</h3>
      <p style={{ color: tk.textDim, fontSize: '13px', margin: 0 }}>
        {isAdmin
          ? 'Go to Tournaments tab → set the "📸 Pic Team" column for competitions to assign them here.'
          : `Ask your admin to assign competitions to ${profile.team} in the Tournaments tab → Pic Team column.`}
      </p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>


      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {([
          { key: 'available', label: '📋 Available', color: tk.borderLight },
          { key: 'claimed',   label: '🙋 Claimed',   color: '#1d4ed8' },
          { key: 'completed', label: '✅ Completed',  color: '#15803d' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600,
              background: subTab === t.key ? t.color : tk.bgInput,
              color: subTab === t.key ? '#fff' : tk.textMuted }}>
            {t.label}
          </button>
        ))}
        <span style={{ color: tk.textDim, fontSize: '12px', marginLeft: '8px' }}>
          {loading ? '…' : `${total.toLocaleString('en-US')} total · showing ${players.length}`}
        </span>
      </div>

      {/* Filters */}
      <div style={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius: '12px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <input type="text" placeholder="🔍 Search player…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ ...inp, flex: 1, minWidth: '180px' }} />

          <select value={filterTour} onChange={e => setFilterTour(e.target.value)}
            style={{ ...inp, maxWidth: '240px' }}>
            <option value="">All Pic Competitions ({myTours.length})</option>
            {myTours.map(t => (
              <option key={t.tournament_name ?? 'NULL'} value={t.tournament_name ?? 'NULL'}>
                {t.tournament_name ?? '(No Tournament)'} — {t.profile_pic_team}
              </option>
            ))}
          </select>

          <button onClick={() => { setSearch(''); setFilterTour('') }}
            style={{ background: 'none', border: 'none', color: tk.textDim, cursor: 'pointer', fontSize: '12px' }}>
            Clear
          </button>

          <button onClick={() => setPage(p => p === 1 ? 0 : 1)}
            title="Refresh current view"
            style={{ background: tk.bgInput, border: `1px solid ${tk.border}`, color: tk.textMuted,
              padding: '5px 10px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
            🔄
          </button>
        </div>

        {/* Completed tab — admin move back to available */}
        {subTab === 'completed' && isAdmin && selected.size > 0 && (
          <div style={{ marginTop: '10px', padding: '10px 14px', background: '#1c1917', borderRadius: '8px',
            border: '1px solid #44403c', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ color: tk.textMuted, fontSize: '12px' }}>
              {selected.size} player{selected.size > 1 ? 's' : ''} selected
            </span>
            <button onClick={async () => {
              const ids = Array.from(selected)
              const now = new Date().toISOString()
              await supabase.from('player_tasks')
                .update({ status: 'Pending', operator_id: null, operator_name: null, assigned_to: null, updated_at: now })
                .in('player_id', ids)
                .eq('category', 'Profile Pic Update')
              setPlayers(prev => prev.filter(p => !new Set(ids).has(p.player_id)))
              setTotal(prev => Math.max(0, prev - ids.length))
              setSelected(new Set())
              setClaimMsg(`↩️ ${ids.length} player${ids.length > 1 ? 's' : ''} moved back to Available`)
            }}
              style={{ background: '#7c3aed', border: 'none', color: '#fff', fontWeight: 600,
                fontSize: '12px', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', marginLeft: 'auto' }}>
              ↩️ Move Selected Back to Available
            </button>
            {claimMsg && <span style={{ color: '#86efac', fontSize: '12px' }}>{claimMsg}</span>}
          </div>
        )}

        {/* Claimed tab controls */}
        {subTab === 'claimed' && (
          <div style={{ marginTop: '10px', padding: '10px 14px', background: '#1c1917', borderRadius: '8px',
            border: '1px solid #44403c', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ color: '#a8a29e', fontSize: '12px' }}>
              {selected.size > 0 ? `${selected.size} selected` : 'Your claimed pic jobs — update status with the dropdown'}
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

        {/* Claim bar — Available only */}
        {subTab === 'available' && selected.size > 0 && (
          <div style={{ marginTop: '10px', padding: '10px 14px', background: '#1e3a5f', borderRadius: '8px',
            border: '1px solid #1d4ed8', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ color: '#93c5fd', fontSize: '13px', fontWeight: 600 }}>
              {selected.size} selected
            </span>
            <button onClick={claimSelected} disabled={claiming}
              style={{ background: '#f97316', border: 'none', color: '#fff', fontWeight: 700, fontSize: '13px',
                padding: '7px 18px', borderRadius: '8px', cursor: 'pointer', opacity: claiming ? 0.6 : 1 }}>
              {claiming ? 'Claiming…' : `🙋 Claim ${selected.size}`}
            </button>
            <button onClick={() => setSelected(new Set())}
              style={{ background: 'none', border: `1px solid ${tk.borderLight}`, color: tk.textMuted, fontSize: '12px',
                padding: '6px 12px', borderRadius: '8px', cursor: 'pointer' }}>
              Deselect all
            </button>
            {claimMsg && <span style={{ color: '#86efac', fontSize: '12px' }}>{claimMsg}</span>}
          </div>
        )}
        {claimMsg && selected.size === 0 && (
          <p style={{ color: '#86efac', fontSize: '12px', margin: '8px 0 0' }}>{claimMsg}</p>
        )}
      </div>

      {/* Table */}
      <div style={{ background: tk.bg, border: `1px solid ${tk.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1350px' }}>
            <thead>
              <tr>
                {(subTab === 'available' || subTab === 'claimed' || (subTab === 'completed' && isAdmin)) && (
                  <th style={{ ...th, width: '36px', textAlign: 'center' }}>
                    <input type="checkbox"
                      checked={players.length > 0 && selected.size === players.length}
                      onChange={() => setSelected(selected.size === players.length
                        ? new Set() : new Set(players.map(p => p.player_id)))}
                      style={{ accentColor: '#f97316', cursor: 'pointer' }} />
                  </th>
                )}
                <th style={th}>Player ID</th>
                <th style={{ ...th, textAlign: 'center', width: '70px' }}>Photo</th>
                <th style={th}>Full Name</th>
                <th style={th}>#</th>
                <th style={th}>Gender</th>
                <th style={th}>Last Team</th>
                <th style={th}>Last Match</th>
                <th style={th}>Season</th>
                <th style={th}>Tournament</th>
                <th style={th}>Operator</th>
                <th style={th}>Source URL</th>
                <th style={th}>📸 Pic Status</th>
                {subTab === 'completed' && <th style={th}>Completed At</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: (subTab === 'completed' && !isAdmin) ? 13 : 14 }).map((_, j) => (
                    <td key={j} style={td}><div style={{ height: '12px', background: tk.tableHead, borderRadius: '4px' }} /></td>
                  ))}</tr>
                ))
              ) : players.length === 0 ? (
                <tr>
                  <td colSpan={(subTab === 'completed' && !isAdmin) ? 13 : 14} style={{ ...td, textAlign: 'center', color: tk.textFaint, padding: '48px' }}>
{subTab === 'available' ? 'No unclaimed players — all claimed or done! 🎉' :
                       subTab === 'claimed'   ? `No active claimed players for ${profile.full_name || profile.email}` :
                       'No completed profile pic updates yet'}
                  </td>
                </tr>
              ) : players.map(player => {
                const task        = player.picTask
                const sc          = STATUS_COLOR[task?.status || 'Pending']
                const isSelected  = selected.has(player.player_id)
                const urlVal      = editingUrl[String(player.player_id)] ?? ''
                const existingUrls = task?.source_urls || []
                const editKey     = `edit_${player.player_id}`
                const editIdx     = editingUrl[editKey] !== undefined ? parseInt(editingUrl[editKey]) : -1

                return (
                  <tr key={player.player_id}
                    style={{ background: isSelected ? 'rgba(249,115,22,0.08)' : 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = tk.rowHover }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>

                    {(subTab === 'available' || subTab === 'claimed' || (subTab === 'completed' && isAdmin)) && (
                      <td style={{ ...td, textAlign: 'center' }}>
                        <input type="checkbox" checked={isSelected}
                          onChange={() => {
                            const n = new Set(selected)
                            n.has(player.player_id) ? n.delete(player.player_id) : n.add(player.player_id)
                            setSelected(n)
                          }}
                          style={{ accentColor: '#f97316', cursor: 'pointer' }} />
                      </td>
                    )}

                    {/* Player ID — click number to copy, ↗ to open */}
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <span
                          onClick={() => { navigator.clipboard.writeText(String(player.player_id)); }}
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

                    {/* Profile photo */}
                    <td style={{ ...td, textAlign: 'center', width: '70px' }}>
                      <a href={`https://hockey.instatscout.com/images/players/180/${player.player_id}.png`}
                        target="_blank" rel="noreferrer" title="View full image">
                        <img
                          src={`https://hockey.instatscout.com/images/players/180/${player.player_id}.png`}
                          alt={player.full_name}
                          onError={e => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(player.full_name)}&size=48&background=374151&color=9ca3af&bold=true&rounded=true`
                          }}
                          style={{ width: '44px', height: '44px', borderRadius: '50%',
                            objectFit: 'cover', border: `2px solid ${tk.border}`,
                            display: 'block', margin: '0 auto' }}
                        />
                      </a>
                    </td>

                    {/* Full name — click to Google search name + team */}
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

                    {/* # sweater */}
                    <td style={{ ...td, textAlign: 'center' }}>
                      {player.club_sweater_num != null
                        ? <span style={{ background: tk.tableHead, padding: '2px 6px', borderRadius: '4px', fontWeight: 600, color: tk.text, fontSize: '11px' }}>
                            {player.club_sweater_num}
                          </span>
                        : <span style={{ color: tk.borderLight }}>—</span>}
                    </td>

                    {/* Gender */}
                    <td style={td}>
                      {player.player_gender != null
                        ? <span style={{ color: player.player_gender === 1 ? '#60a5fa' : '#f472b6', fontSize: '11px', fontWeight: 600 }}>
                            {GENDER_MAP[player.player_gender] || '—'}
                          </span>
                        : <span style={{ color: tk.borderLight }}>—</span>}
                    </td>

                    {/* Last Team */}
                    <td style={{ ...td, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player.last_team_name || <span style={{ color: tk.borderLight }}>—</span>}
                    </td>

                    {/* Last Match */}
                    <td style={{ ...td, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={player.player_last_match_name || ''}>
                      {player.player_last_match_name || <span style={{ color: tk.borderLight }}>—</span>}
                    </td>

                    {/* Season */}
                    <td style={{ ...td, whiteSpace: 'nowrap', fontSize: '11px', color: tk.textMuted }}>
                      {player.player_last_match_season_name || <span style={{ color: tk.borderLight }}>—</span>}
                    </td>

                    {/* Tournament */}
                    <td style={{ ...td, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#a78bfa', fontSize: '11px' }}>
                        {player.player_last_match_tournament_name || <span style={{ color: tk.borderLight, fontStyle: 'italic' }}>—</span>}
                      </span>
                    </td>

                    {/* Operator */}
                    <td style={td}>
                      {task?.operator_name
                        ? <span style={{ background: '#1e3a5f', color: '#93c5fd', fontSize: '11px', fontWeight: 600,
                            padding: '2px 8px', borderRadius: '99px', whiteSpace: 'nowrap' }}>
                            👤 {task.operator_name}
                          </span>
                        : <span style={{ color: tk.borderLight, fontSize: '11px' }}>—</span>}
                    </td>

                    {/* Source URL with edit/delete */}
                    <td style={{ ...td, minWidth: '200px' }}>
                      {existingUrls.map((u, i) => (
                        editIdx === i ? (
                          <div key={i} style={{ display: 'flex', gap: '3px', marginBottom: '3px' }}>
                            <input type="url" defaultValue={u} autoFocus
                              id={`pic-edit-${player.player_id}-${i}`}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  const val = (e.target as HTMLInputElement).value.trim()
                                  if (val) saveUrl(player, existingUrls.map((x, j) => j === i ? val : x))
                                  setEditingUrl(prev => { const n = { ...prev }; delete n[editKey]; return n })
                                }
                                if (e.key === 'Escape') setEditingUrl(prev => { const n = { ...prev }; delete n[editKey]; return n })
                              }}
                              style={{ flex: 1, background: '#1d4ed8', border: '1px solid #3b82f6',
                                borderRadius: '4px', padding: '3px 6px', color: '#fff', fontSize: '10px', outline: 'none', minWidth: 0 }} />
                            <button onClick={() => {
                              const el = document.getElementById(`pic-edit-${player.player_id}-${i}`) as HTMLInputElement
                              const val = el?.value.trim()
                              if (val) saveUrl(player, existingUrls.map((x, j) => j === i ? val : x))
                              setEditingUrl(prev => { const n = { ...prev }; delete n[editKey]; return n })
                            }} style={{ background: '#15803d', border: 'none', color: '#fff', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer', fontSize: '10px' }}>✓</button>
                            <button onClick={() => setEditingUrl(prev => { const n = { ...prev }; delete n[editKey]; return n })}
                              style={{ background: tk.borderLight, border: 'none', color: tk.textMuted, borderRadius: '4px', padding: '3px 5px', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                          </div>
                        ) : (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '2px' }}>
                            <a href={u} target="_blank" rel="noreferrer"
                              style={{ color: '#60a5fa', fontSize: '10px', textDecoration: 'none',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}
                              title={u}>
                              🔗 {u.replace(/^https?:\/\//, '').substring(0, 22)}…
                            </a>
                            <button onClick={() => setEditingUrl(prev => ({ ...prev, [editKey]: String(i) }))}
                              title="Edit" style={{ background: 'none', border: 'none', color: tk.textFaint, cursor: 'pointer', fontSize: '11px', padding: '1px 3px', lineHeight: 1 }}>✏️</button>
                            <button onClick={() => saveUrl(player, existingUrls.filter((_, j) => j !== i))}
                              title="Remove" style={{ background: 'none', border: 'none', color: tk.textFaint, cursor: 'pointer', fontSize: '10px', padding: '1px 3px', lineHeight: 1 }}>✕</button>
                          </div>
                        )
                      ))}
                      <div style={{ display: 'flex', gap: '4px', marginTop: existingUrls.length > 0 ? '4px' : '0' }}>
                        <input type="url" value={urlVal}
                          onChange={e => setEditingUrl(prev => ({ ...prev, [String(player.player_id)]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') saveUrl(player) }}
                          placeholder="Paste source URL…"
                          style={{ flex: 1, background: tk.tableRow, border: `1px solid ${tk.border}`,
                            borderRadius: '6px', padding: '4px 8px', color: tk.textMuted,
                            fontSize: '11px', outline: 'none', minWidth: 0 }} />
                        {urlVal && (
                          <button onClick={() => saveUrl(player)} disabled={savingUrl === player.player_id}
                            style={{ background: '#1d4ed8', border: 'none', color: '#fff', borderRadius: '6px',
                              padding: '4px 8px', cursor: 'pointer', fontSize: '11px', flexShrink: 0 }}>
                            {savingUrl === player.player_id ? '…' : '＋'}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Status — editable in Claimed only, view-only in Available/Completed */}
                    <td style={td}>
                      {subTab === 'claimed' ? (
                        <select value={task?.status || 'Pending'}
                          onChange={e => updateStatus(player, e.target.value as Status)}
                          style={{ background: sc.bg, color: sc.text, border: 'none', borderRadius: '99px',
                            padding: '3px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', outline: 'none',
                            minWidth: '90px' }}>
                          {PIC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span style={{ background: sc.bg, color: sc.text, fontSize: '11px', fontWeight: 600,
                          padding: '3px 10px', borderRadius: '99px', whiteSpace: 'nowrap',
                          display: 'inline-block' }}>
                          {task?.status || 'Pending'}
                        </span>
                      )}
                    </td>

                    {subTab === 'completed' && (
                      <td style={{ ...td, color: tk.textDim, fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {task?.completed_at
                          ? new Date(task.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
                          : '—'}
                      </td>
                    )}
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
            Page {page} of {totalPages || 1}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[{ l: '«', a: () => setPage(1) }, { l: '‹', a: () => setPage(p => Math.max(1, p - 1)) },
              { l: '›', a: () => setPage(p => Math.min(totalPages, p + 1)) }, { l: '»', a: () => setPage(totalPages) }]
              .map(({ l, a }, i) => (
                <button key={i} onClick={a}
                  style={{ background: tk.bgInput, border: `1px solid ${tk.borderLight}`, color: tk.textMuted,
                    padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                  {l}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
