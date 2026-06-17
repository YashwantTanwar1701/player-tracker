'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Player, PlayerTask, UserProfile, Status, STATUS_COLOR } from '@/types'
import { useTheme, T } from '@/components/Dashboard'

const PAGE = 50
const DONE_STATUSES: Status[] = ['Yes', 'Already Updated', 'Not Found On Any Source', 'Player Not Found Online', 'Blocked']
const PIC_STATUSES:  Status[] = ['Pending', 'In Progress', 'Yes', 'Already Updated', 'Not Found On Any Source', 'Player Not Found Online', 'Blocked']

interface TournamentMeta {
  tournament_name:  string | null
  assigned_team:    string | null
  profile_pic_team: string | null
  is_active:        boolean | null
}

interface PlayerWithTask extends Player {
  picTask: PlayerTask | undefined
}

interface Props { profile: UserProfile }

export default function ProfilePicTab({ profile }: Props) {
  const supabase = createClient()
  const theme    = useTheme(); const tk = T[theme]
  const isAdmin  = profile.role === 'admin' || profile.team === 'Admin'

  const [subTab,       setSubTab]       = useState<'available' | 'claimed' | 'completed'>('available')
  const [tournaments,  setTournaments]  = useState<TournamentMeta[]>([])
  const [tourReady,    setTourReady]    = useState(false)
  const [players,      setPlayers]      = useState<PlayerWithTask[]>([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(1)
  const [loading,      setLoading]      = useState(false)
  const [search,       setSearch]       = useState('')
  const [filterTour,   setFilterTour]   = useState('')
  const [selected,     setSelected]     = useState<Set<number>>(new Set())
  const [claiming,     setClaiming]     = useState(false)
  const [claimMsg,     setClaimMsg]     = useState<string | null>(null)
  const [editingUrl,   setEditingUrl]   = useState<Record<string, string>>({})
  const [savingUrl,    setSavingUrl]    = useState<number | null>(null)

  // Load tournaments fresh
  useEffect(() => {
    supabase.from('tournament_overview')
      .select('tournament_name, assigned_team, profile_pic_team, is_active')
      .then(({ data }) => {
        setTournaments((data || []) as TournamentMeta[])
        setTourReady(true)
      })
  }, [])

  // My visible pic tournaments
  const myTours = tournaments.filter(t =>
    t.is_active !== false &&
    t.profile_pic_team !== null &&
    (isAdmin || t.profile_pic_team === profile.team)
  )

  useEffect(() => {
    if (!tourReady) return
    fetchPlayers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourReady, page, search, filterTour, subTab])

  useEffect(() => { setPage(1) }, [search, filterTour, subTab])

  async function fetchPlayers() {
    setLoading(true)
    setSelected(new Set())

    if (myTours.length === 0) {
      setPlayers([]); setTotal(0); setLoading(false); return
    }

    // Which tournament names to show
    let tourNames: string[] = []
    if (filterTour && filterTour !== '') {
      tourNames = [filterTour]
    } else {
      tourNames = myTours.map(t => t.tournament_name).filter(Boolean) as string[]
    }

    if (tourNames.length === 0) {
      setPlayers([]); setTotal(0); setLoading(false); return
    }

    if (subTab === 'completed') {
      await fetchCompleted(tourNames)
      return
    }

    if (subTab === 'claimed') {
      await fetchClaimed(tourNames)
      return
    }

    // Available
    await fetchAvailable(tourNames)
  }

  async function fetchAvailable(tourNames: string[]) {
    // Get claimed/done IDs to exclude
    const [{ data: takenData }, { data: doneData }] = await Promise.all([
      supabase.from('player_tasks').select('player_id').eq('category', 'Profile Pic Update')
        .not('operator_id', 'is', null),
      supabase.from('player_tasks').select('player_id').eq('category', 'Profile Pic Update')
        .not('status', 'in', '(Pending,In Progress)'),
    ])

    const excludeSet = new Set<number>([
      ...(takenData || []).map((t: any) => t.player_id),
      ...(doneData  || []).map((t: any) => t.player_id),
    ])

    let q = supabase.from('players')
      .select('player_id,full_name,club_sweater_num,player_gender,last_team_name,player_last_match_name,player_last_match_tournament_name,player_last_match_season_name', { count:'exact' })
      .in('player_last_match_tournament_name', tourNames)

    if (search) q = q.ilike('full_name', `%${search}%`)

    const from = (page - 1) * PAGE
    const { data, count } = await q
      .order('player_last_match_tournament_name', { ascending:true, nullsFirst:false })
      .order('last_team_name',                     { ascending:true, nullsFirst:false })
      .order('player_gender',                      { ascending:true, nullsFirst:false })
      .order('player_last_match_name',             { ascending:true, nullsFirst:false })
      .range(from, from + PAGE - 1)

    let playerList = (data as Player[]) || []

    // Exclude claimed/done
    if (excludeSet.size > 0) {
      playerList = playerList.filter(p => !excludeSet.has(p.player_id))
    }

    const taskMap: Record<number, PlayerTask> = {}
    if (playerList.length > 0) {
      const ids = playerList.map(p => p.player_id)
      const { data: td } = await supabase.from('player_tasks').select('*')
        .in('player_id', ids).eq('category', 'Profile Pic Update')
      ;(td || []).forEach((t: PlayerTask) => { taskMap[t.player_id] = t })
    }

    setPlayers(playerList.map(p => ({ ...p, picTask: taskMap[p.player_id] })))
    setTotal(count || 0)
    setLoading(false)
  }

  async function fetchClaimed(tourNames: string[]) {
    let tq = supabase.from('player_tasks').select('player_id, status')
      .eq('category', 'Profile Pic Update')
      .not('operator_id', 'is', null)
      .in('status', ['Pending', 'In Progress'])
    if (!isAdmin) tq = tq.eq('operator_id', profile.id)

    const { data: claimedData } = await tq
    if (!claimedData || claimedData.length === 0) {
      setPlayers([]); setTotal(0); setLoading(false); return
    }

    const claimedIds = Array.from(new Set(claimedData.map((t: any) => t.player_id)))

    let q = supabase.from('players')
      .select('player_id,full_name,club_sweater_num,player_gender,last_team_name,player_last_match_name,player_last_match_tournament_name,player_last_match_season_name', { count:'exact' })
      .in('player_id', claimedIds)
      .in('player_last_match_tournament_name', tourNames)

    if (search) q = q.ilike('full_name', `%${search}%`)

    const from = (page - 1) * PAGE
    const { data, count } = await q
      .order('player_last_match_tournament_name', { ascending:true, nullsFirst:false })
      .order('last_team_name',                     { ascending:true, nullsFirst:false })
      .range(from, from + PAGE - 1)

    const playerList = (data as Player[]) || []
    const taskMap: Record<number, PlayerTask> = {}
    if (playerList.length > 0) {
      const ids = playerList.map(p => p.player_id)
      const { data: td } = await supabase.from('player_tasks').select('*')
        .in('player_id', ids).eq('category', 'Profile Pic Update')
      ;(td || []).forEach((t: PlayerTask) => { taskMap[t.player_id] = t })
    }

    setPlayers(playerList.map(p => ({ ...p, picTask: taskMap[p.player_id] })))
    setTotal(count || 0)
    setLoading(false)
  }

  async function fetchCompleted(tourNames: string[]) {
    const { data: doneTasks } = await supabase
      .from('player_tasks')
      .select('player_id, completed_at, updated_at')
      .eq('category', 'Profile Pic Update')
      .not('status', 'in', '(Pending,In Progress)')
      .order('completed_at', { ascending:false, nullsFirst:false })
      .order('updated_at',   { ascending:false, nullsFirst:false })
      .limit(5000)

    if (!doneTasks || doneTasks.length === 0) {
      setPlayers([]); setTotal(0); setLoading(false); return
    }

    const seen = new Set<number>()
    const sortedIds = doneTasks.map((t: any) => t.player_id)
      .filter((id: number) => { if (seen.has(id)) return false; seen.add(id); return true })

    const from   = (page - 1) * PAGE
    const pageIds = sortedIds.slice(from, from + PAGE)

    const { data: pd } = await supabase.from('players')
      .select('player_id,full_name,club_sweater_num,player_gender,last_team_name,player_last_match_name,player_last_match_tournament_name,player_last_match_season_name')
      .in('player_id', pageIds)

    let playerList = (pd || []) as Player[]
    if (tourNames.length > 0) {
      playerList = playerList.filter(p => tourNames.includes(p.player_last_match_tournament_name || ''))
    }
    if (search) {
      const s = search.toLowerCase()
      playerList = playerList.filter(p => p.full_name.toLowerCase().includes(s))
    }

    const orderMap: Record<number, number> = {}
    pageIds.forEach((id: number, i: number) => { orderMap[id] = i })
    playerList.sort((a, b) => (orderMap[a.player_id] ?? 9999) - (orderMap[b.player_id] ?? 9999))

    const taskMap: Record<number, PlayerTask> = {}
    if (playerList.length > 0) {
      const ids = playerList.map(p => p.player_id)
      const { data: td } = await supabase.from('player_tasks').select('*')
        .in('player_id', ids).eq('category', 'Profile Pic Update')
      ;(td || []).forEach((t: PlayerTask) => { taskMap[t.player_id] = t })
    }

    setPlayers(playerList.map(p => ({ ...p, picTask: taskMap[p.player_id] })))
    setTotal(sortedIds.length)
    setLoading(false)
  }

  async function updateStatus(player: PlayerWithTask, status: Status) {
    const now    = new Date().toISOString()
    const isDone = !['Pending', 'In Progress'].includes(status)
    const opTeam = (profile.team === 'Cairo' || profile.team === 'India') ? profile.team : null

    const { data, error } = await supabase.from('player_tasks').upsert({
      player_id: player.player_id, category:'Profile Pic Update', status,
      assigned_to: profile.id, operator_id: profile.id,
      operator_name: profile.full_name || profile.email,
      updated_by: profile.id, team: opTeam, updated_at: now,
      completed_at: isDone ? now : null,
      source_urls: player.picTask?.source_urls || [],
      notes: player.picTask?.notes || null,
    }, { onConflict:'player_id,category' }).select().single()

    if (error) { console.error(error); return }
    if (data) {
      await supabase.from('task_audit_log').insert({
        task_id: data.id, player_id: player.player_id, category:'Profile Pic Update',
        changed_by: profile.id, changed_by_name: profile.full_name || profile.email,
        changed_by_team: profile.team, old_status: player.picTask?.status || null,
        new_status: status, source_urls: data.source_urls || [],
      })

      // Move between tabs
      if (subTab === 'claimed') {
        if (isDone) {
          setPlayers(prev => prev.filter(p => p.player_id !== player.player_id))
        } else {
          setPlayers(prev => prev.map(p =>
            p.player_id === player.player_id ? { ...p, picTask: data as PlayerTask } : p
          ))
        }
      }
    }
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

    // Sync URL across ALL task categories for this player
    await supabase.from('player_tasks')
      .update({ source_urls: newUrls, updated_at: new Date().toISOString() })
      .eq('player_id', player.player_id)

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
    const ids    = Array.from(selected)
    const now    = new Date().toISOString()
    const opTeam = (profile.team === 'Cairo' || profile.team === 'India') ? profile.team : null
    const opLabel = profile.full_name || profile.email

    const ups = ids.map(pid => ({
      player_id: pid, category:'Profile Pic Update', status:'In Progress' as Status,
      assigned_to: profile.id, operator_id: profile.id, operator_name: opLabel,
      updated_by: profile.id, team: opTeam, updated_at: now,
    }))

    const { error } = await supabase.from('player_tasks').upsert(ups, { onConflict:'player_id,category' })
    if (error) console.error('Claim error:', error)

    setPlayers(prev => prev.filter(p => !new Set(ids).has(p.player_id)))
    setTotal(prev => Math.max(0, prev - ids.length))
    setClaimMsg(`✅ Claimed ${ids.length} player${ids.length>1?'s':''} — check Claimed tab`)
    setSelected(new Set())
    setClaiming(false)
  }

  async function unclaim(mode: 'selected' | 'all') {
    setClaiming(true); setClaimMsg(null)
    const now  = new Date().toISOString()
    const reset = { status:'Pending', operator_id:null, operator_name:null, assigned_to:null, updated_at:now }

    if (mode === 'all') {
      let q = supabase.from('player_tasks').update(reset)
        .eq('category', 'Profile Pic Update')
        .in('status', ['In Progress', 'Pending'])
      if (!isAdmin) q = q.eq('operator_id', profile.id)
      await q
      setClaimMsg('↩️ All your claimed pic jobs moved back to Available')
    } else {
      const ids = Array.from(selected)
      if (ids.length === 0) { setClaiming(false); return }
      let q = supabase.from('player_tasks').update(reset)
        .in('player_id', ids).eq('category', 'Profile Pic Update')
      if (!isAdmin) q = q.eq('operator_id', profile.id)
      await q
      setClaimMsg(`↩️ ${ids.length} player${ids.length>1?'s':''} moved back to Available`)
    }

    setSelected(new Set()); setClaiming(false); setPage(1); setSubTab('available')
    setTimeout(() => fetchPlayers(), 300)
  }

  async function moveCompletedToAvailable() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    await supabase.from('player_tasks')
      .update({ status:'Pending', operator_id:null, operator_name:null, assigned_to:null,
        completed_at:null, updated_at:new Date().toISOString() })
      .in('player_id', ids).eq('category', 'Profile Pic Update')
    setPlayers(prev => prev.filter(p => !new Set(ids).has(p.player_id)))
    setTotal(prev => Math.max(0, prev - ids.length))
    setSelected(new Set())
    setClaimMsg(`↩️ ${ids.length} player${ids.length>1?'s':''} moved back to Available`)
  }

  const inp: React.CSSProperties = {
    background:tk.bgInput, border:`1px solid ${tk.border}`, borderRadius:'8px',
    padding:'7px 11px', color:tk.text, fontSize:'12px', outline:'none',
  }
  const th: React.CSSProperties = {
    padding:'9px 10px', color:tk.textDim, fontSize:'10px', fontWeight:700,
    textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'left',
    background:tk.tableHead, borderBottom:`1px solid ${tk.border}`, whiteSpace:'nowrap',
    position:'sticky', top:0, zIndex:10,
  }
  const td: React.CSSProperties = {
    padding:'9px 10px', borderBottom:`1px solid ${tk.tableRow}`,
    fontSize:'12px', color:tk.textMuted, verticalAlign:'middle',
  }

  if (tourReady && myTours.length === 0) return (
    <div style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'12px', padding:'48px', textAlign:'center' }}>
      <div style={{ fontSize:'32px', marginBottom:'12px' }}>📸</div>
      <h3 style={{ color:tk.text, fontWeight:600, margin:'0 0 8px' }}>No Profile Pic Competitions Assigned</h3>
      <p style={{ color:tk.textMuted, fontSize:'13px', margin:0 }}>
        {isAdmin ? 'Go to Tournaments tab → set the 📸 Pic Team column for competitions.'
          : `Ask your admin to assign competitions to ${profile.team} in the Tournaments tab → Pic Team column.`}
      </p>
    </div>
  )

  const showCheckbox = subTab === 'available' || subTab === 'claimed' || (subTab === 'completed' && isAdmin)
  const totalPages   = Math.ceil(total / PAGE)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

      {/* Sub-tabs */}
      <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
        {([
          { key:'available', label:'📋 Available', color:'#374151' },
          { key:'claimed',   label:'🙋 Claimed',   color:'#1d4ed8' },
          { key:'completed', label:'✅ Completed',  color:'#15803d' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            style={{ padding:'8px 20px', borderRadius:'8px', border:'none', cursor:'pointer',
              fontSize:'13px', fontWeight:600,
              background:subTab===t.key?t.color:tk.bgInput, color:subTab===t.key?'#fff':tk.textMuted }}>
            {t.label}
          </button>
        ))}
        <span style={{ color:tk.textDim, fontSize:'12px', marginLeft:'8px' }}>
          {loading ? '…' : `${total.toLocaleString('en-US')} total · showing ${players.length}`}
        </span>
      </div>

      {/* Filters */}
      <div style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'12px', padding:'12px 16px' }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center' }}>
          <input type="text" placeholder="🔍 Search player…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ ...inp, flex:1, minWidth:'180px' }} />

          <select value={filterTour} onChange={e => setFilterTour(e.target.value)} style={{ ...inp, maxWidth:'260px' }}>
            <option value="">All Pic Competitions ({myTours.length})</option>
            {myTours.map(t => (
              <option key={t.tournament_name ?? 'NULL'} value={t.tournament_name ?? 'NULL'}>
                {t.tournament_name ?? '(No Tournament)'} — {t.profile_pic_team}
              </option>
            ))}
          </select>

          <button onClick={() => { setSearch(''); setFilterTour('') }}
            style={{ background:'none', border:'none', color:tk.textDim, cursor:'pointer', fontSize:'12px' }}>Clear</button>
          <button onClick={() => fetchPlayers()} title="Refresh"
            style={{ background:tk.bgInput, border:`1px solid ${tk.border}`, color:tk.textMuted,
              padding:'5px 10px', borderRadius:'7px', cursor:'pointer', fontSize:'12px' }}>🔄</button>
        </div>

        {/* Claim bar */}
        {subTab === 'available' && selected.size > 0 && (
          <div style={{ marginTop:'10px', padding:'10px 14px', background:'#1e3a5f', borderRadius:'8px',
            border:'1px solid #1d4ed8', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
            <span style={{ color:'#93c5fd', fontSize:'13px', fontWeight:600 }}>{selected.size} selected</span>
            <button onClick={claimSelected} disabled={claiming}
              style={{ background:'#f97316', border:'none', color:'#fff', fontWeight:700, fontSize:'13px',
                padding:'7px 18px', borderRadius:'8px', cursor:'pointer', opacity:claiming?0.6:1 }}>
              {claiming ? 'Claiming…' : `🙋 Claim ${selected.size} →`}
            </button>
            <button onClick={() => setSelected(new Set())}
              style={{ background:'none', border:`1px solid ${tk.border}`, color:tk.textMuted,
                fontSize:'12px', padding:'6px 12px', borderRadius:'8px', cursor:'pointer' }}>Deselect all</button>
            {claimMsg && <span style={{ color:'#86efac', fontSize:'12px' }}>{claimMsg}</span>}
          </div>
        )}

        {subTab === 'claimed' && (
          <div style={{ marginTop:'10px', padding:'10px 14px', background:tk.bgInput, borderRadius:'8px',
            border:`1px solid ${tk.border}`, display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
            <span style={{ color:tk.textMuted, fontSize:'12px' }}>
              {selected.size > 0 ? `${selected.size} selected` : 'Update statuses using the dropdowns'}
            </span>
            <div style={{ display:'flex', gap:'8px', marginLeft:'auto' }}>
              {selected.size > 0 && (
                <button onClick={() => unclaim('selected')} disabled={claiming}
                  style={{ background:'#7c3aed', border:'none', color:'#fff', fontWeight:600, fontSize:'12px',
                    padding:'6px 14px', borderRadius:'8px', cursor:'pointer', opacity:claiming?0.6:1 }}>
                  {claiming ? '…' : `↩️ Unclaim (${selected.size})`}
                </button>
              )}
              <button onClick={() => unclaim('all')} disabled={claiming}
                style={{ background:tk.bgInput, border:`1px solid ${tk.border}`, color:tk.textDim,
                  fontWeight:600, fontSize:'12px', padding:'6px 14px', borderRadius:'8px', cursor:'pointer' }}>
                ↩️ Move All → Available
              </button>
            </div>
            {claimMsg && <span style={{ color:'#86efac', fontSize:'12px' }}>{claimMsg}</span>}
          </div>
        )}

        {subTab === 'completed' && isAdmin && selected.size > 0 && (
          <div style={{ marginTop:'10px', padding:'10px 14px', background:tk.bgInput, borderRadius:'8px',
            border:`1px solid ${tk.border}`, display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
            <span style={{ color:tk.textMuted, fontSize:'12px' }}>{selected.size} selected</span>
            <button onClick={moveCompletedToAvailable}
              style={{ background:'#7c3aed', border:'none', color:'#fff', fontWeight:600, fontSize:'12px',
                padding:'6px 14px', borderRadius:'8px', cursor:'pointer', marginLeft:'auto' }}>
              ↩️ Move Selected Back to Available
            </button>
            {claimMsg && <span style={{ color:'#86efac', fontSize:'12px' }}>{claimMsg}</span>}
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ background:tk.bg, border:`1px solid ${tk.border}`, borderRadius:'12px', overflow:'hidden' }}>
        <div style={{ overflowX:'auto', maxHeight:'calc(100vh - 280px)', overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'1350px' }}>
            <thead>
              <tr>
                {showCheckbox && (
                  <th style={{ ...th, width:'36px', textAlign:'center' }}>
                    <input type="checkbox"
                      checked={players.length > 0 && selected.size === players.length}
                      onChange={() => setSelected(selected.size===players.length ? new Set() : new Set(players.map(p=>p.player_id)))}
                      style={{ accentColor:'#f97316', cursor:'pointer' }} />
                  </th>
                )}
                <th style={th}>Player ID</th>
                <th style={{ ...th, textAlign:'center', width:'70px' }}>Photo</th>
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
                Array.from({ length:10 }).map((_,i) => (
                  <tr key={i}>{Array.from({ length:showCheckbox?14:13 }).map((_,j) => (
                    <td key={j} style={td}><div style={{ height:'12px', background:tk.tableRow, borderRadius:'4px' }}/></td>
                  ))}</tr>
                ))
              ) : players.length === 0 ? (
                <tr><td colSpan={showCheckbox?14:13}
                  style={{ ...td, textAlign:'center', color:tk.textFaint, padding:'48px' }}>
                  {subTab==='available' ? 'No unclaimed players — all claimed or done! 🎉'
                    : subTab==='claimed' ? `No active claimed players for ${profile.full_name || profile.email}`
                    : 'No completed profile pic updates yet'}
                </td></tr>
              ) : players.map(player => {
                const task      = player.picTask
                const sc        = STATUS_COLOR[task?.status || 'Pending']
                const isSelected = selected.has(player.player_id)
                const urlVal    = editingUrl[String(player.player_id)] ?? ''
                const existingUrls = task?.source_urls || []
                const editKey   = `edit_${player.player_id}`
                const editIdx   = editingUrl[editKey] !== undefined ? parseInt(editingUrl[editKey]) : -1

                return (
                  <tr key={player.player_id}
                    style={{ background:isSelected?'rgba(249,115,22,0.08)':'transparent' }}
                    onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background = tk.rowHover }}
                    onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background = 'transparent' }}>

                    {showCheckbox && (
                      <td style={{ ...td, textAlign:'center' }}>
                        <input type="checkbox" checked={isSelected}
                          onChange={() => { const n=new Set(selected); n.has(player.player_id)?n.delete(player.player_id):n.add(player.player_id); setSelected(n) }}
                          style={{ accentColor:'#f97316', cursor:'pointer' }} />
                      </td>
                    )}

                    {/* Player ID */}
                    <td style={td}>
                      <div style={{ display:'flex', alignItems:'center', gap:'3px' }}>
                        <span onClick={() => navigator.clipboard.writeText(String(player.player_id))}
                          title="Click to copy"
                          style={{ color:'#f97316', fontWeight:700, fontFamily:'monospace', fontSize:'11px',
                            cursor:'pointer', textDecoration:'underline dotted' }}>
                          {player.player_id}
                        </span>
                        <a href={`https://data.instatfootball.tv/hockeyplayers?dbs_id=${player.player_id}`}
                          target="_blank" rel="noreferrer"
                          style={{ color:'#f97316', textDecoration:'none', fontSize:'11px' }} title="Open in Instat">↗</a>
                      </div>
                    </td>

                    {/* Photo */}
                    <td style={{ ...td, textAlign:'center' }}>
                      <a href={`https://hockey.instatscout.com/images/players/180/${player.player_id}.png`}
                        target="_blank" rel="noreferrer" title="View full image">
                        <img src={`https://hockey.instatscout.com/images/players/180/${player.player_id}.png`}
                          alt={player.full_name}
                          onError={e => { (e.target as HTMLImageElement).src =
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(player.full_name)}&size=48&background=374151&color=9ca3af&bold=true&rounded=true` }}
                          style={{ width:'44px', height:'44px', borderRadius:'50%', objectFit:'cover',
                            border:`2px solid ${tk.border}`, display:'block', margin:'0 auto' }}
                        />
                      </a>
                    </td>

                    {/* Full Name */}
                    <td style={{ ...td, fontWeight:600, whiteSpace:'nowrap' }}>
                      <a href={`https://www.google.com/search?q=${encodeURIComponent(`${player.full_name} ${player.last_team_name || ''}`.trim())}`}
                        target="_blank" rel="noreferrer"
                        style={{ color:tk.text, textDecoration:'none' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration='underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration='none')}>
                        {player.full_name}
                      </a>
                    </td>

                    <td style={{ ...td, textAlign:'center' }}>
                      {player.club_sweater_num != null
                        ? <span style={{ background:tk.tableHead, padding:'2px 6px', borderRadius:'4px', fontWeight:600, color:tk.text, fontSize:'11px' }}>{player.club_sweater_num}</span>
                        : <span style={{ color:tk.borderLight }}>—</span>}
                    </td>

                    <td style={td}>
                      {player.player_gender != null
                        ? <span style={{ color:player.player_gender===1?'#60a5fa':'#f472b6', fontSize:'11px', fontWeight:600 }}>
                            {player.player_gender===1?'Male':'Female'}
                          </span>
                        : <span style={{ color:tk.borderLight }}>—</span>}
                    </td>

                    <td style={{ ...td, maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {player.last_team_name || <span style={{ color:tk.borderLight }}>—</span>}
                    </td>

                    <td style={{ ...td, maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                      title={player.player_last_match_name || ''}>
                      {player.player_last_match_name || <span style={{ color:tk.borderLight }}>—</span>}
                    </td>

                    <td style={{ ...td, fontSize:'11px', color:tk.textDim, whiteSpace:'nowrap' }}>
                      {player.player_last_match_season_name || <span style={{ color:tk.borderLight }}>—</span>}
                    </td>

                    <td style={{ ...td, maxWidth:'150px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      <span style={{ color:'#a78bfa', fontSize:'11px' }}>
                        {player.player_last_match_tournament_name || <span style={{ color:tk.borderLight }}>—</span>}
                      </span>
                    </td>

                    {/* Operator */}
                    <td style={td}>
                      {task?.operator_name
                        ? <span style={{ background:'#1e3a5f', color:'#93c5fd', fontSize:'11px', fontWeight:600,
                            padding:'2px 8px', borderRadius:'99px', whiteSpace:'nowrap' }}>
                            👤 {task.operator_name}
                          </span>
                        : <span style={{ color:tk.borderLight, fontSize:'11px' }}>—</span>}
                    </td>

                    {/* Source URL */}
                    <td style={{ ...td, minWidth:'200px' }}>
                      {existingUrls.map((u, i) => (
                        editIdx === i ? (
                          <div key={i} style={{ display:'flex', gap:'3px', marginBottom:'3px' }}>
                            <input type="url" defaultValue={u} autoFocus id={`pic-edit-${player.player_id}-${i}`}
                              onKeyDown={e => {
                                if (e.key==='Enter') { const v=(e.target as HTMLInputElement).value.trim(); if(v) saveUrl(player,existingUrls.map((x,j)=>j===i?v:x)); setEditingUrl(prev=>{const n={...prev};delete n[editKey];return n}) }
                                if (e.key==='Escape') setEditingUrl(prev=>{const n={...prev};delete n[editKey];return n})
                              }}
                              style={{ flex:1, background:'#1d4ed8', border:'1px solid #3b82f6', borderRadius:'4px', padding:'3px 6px', color:'#fff', fontSize:'10px', outline:'none', minWidth:0 }}/>
                            <button onClick={() => { const el=document.getElementById(`pic-edit-${player.player_id}-${i}`) as HTMLInputElement; const v=el?.value.trim(); if(v) saveUrl(player,existingUrls.map((x,j)=>j===i?v:x)); setEditingUrl(prev=>{const n={...prev};delete n[editKey];return n}) }}
                              style={{ background:'#15803d', border:'none', color:'#fff', borderRadius:'4px', padding:'3px 6px', cursor:'pointer', fontSize:'10px' }}>✓</button>
                            <button onClick={() => setEditingUrl(prev=>{const n={...prev};delete n[editKey];return n})}
                              style={{ background:tk.borderLight, border:'none', color:tk.textMuted, borderRadius:'4px', padding:'3px 5px', cursor:'pointer', fontSize:'10px' }}>✕</button>
                          </div>
                        ) : (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:'3px', marginBottom:'2px' }}>
                            <a href={u} target="_blank" rel="noreferrer"
                              style={{ color:'#60a5fa', fontSize:'10px', textDecoration:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }} title={u}>
                              🔗 {u.replace(/^https?:\/\//,'').substring(0,22)}…
                            </a>
                            <button onClick={() => setEditingUrl(prev=>({...prev,[editKey]:String(i)}))}
                              style={{ background:'none', border:'none', color:tk.textFaint, cursor:'pointer', fontSize:'11px', padding:'1px 3px' }}>✏️</button>
                            <button onClick={() => saveUrl(player, existingUrls.filter((_,j)=>j!==i))}
                              style={{ background:'none', border:'none', color:tk.textFaint, cursor:'pointer', fontSize:'10px', padding:'1px 3px' }}>✕</button>
                          </div>
                        )
                      ))}
                      <div style={{ display:'flex', gap:'4px', marginTop:existingUrls.length>0?'4px':'0' }}>
                        <input type="url" value={urlVal}
                          onChange={e => setEditingUrl(prev=>({...prev,[String(player.player_id)]:e.target.value}))}
                          onKeyDown={e => { if(e.key==='Enter') saveUrl(player) }}
                          placeholder="Paste source URL…"
                          style={{ flex:1, background:tk.bgInput, border:`1px solid ${tk.border}`, borderRadius:'6px', padding:'4px 8px', color:tk.textMuted, fontSize:'11px', outline:'none', minWidth:0 }}/>
                        {urlVal && (
                          <button onClick={() => saveUrl(player)} disabled={savingUrl===player.player_id}
                            style={{ background:'#1d4ed8', border:'none', color:'#fff', borderRadius:'6px', padding:'4px 8px', cursor:'pointer', fontSize:'11px', flexShrink:0 }}>
                            {savingUrl===player.player_id?'…':'＋'}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Status dropdown — editable only in Claimed */}
                    <td style={td}>
                      {subTab === 'claimed' ? (
                        <select value={task?.status || 'Pending'}
                          onChange={e => updateStatus(player, e.target.value as Status)}
                          style={{ background:sc.bg, color:sc.text, border:'none', borderRadius:'99px',
                            padding:'3px 10px', fontSize:'11px', fontWeight:600, cursor:'pointer', outline:'none', minWidth:'90px' }}>
                          {PIC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span style={{ background:sc.bg, color:sc.text, fontSize:'11px', fontWeight:600,
                          padding:'3px 10px', borderRadius:'99px', whiteSpace:'nowrap', display:'inline-block' }}>
                          {task?.status || 'Pending'}
                        </span>
                      )}
                    </td>

                    {subTab === 'completed' && (
                      <td style={{ ...td, color:tk.textDim, fontSize:'11px', whiteSpace:'nowrap' }}>
                        {task?.completed_at || task?.updated_at
                          ? new Date(task.completed_at || task.updated_at!).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false })
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
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          padding:'10px 16px', borderTop:`1px solid ${tk.border}`, background:tk.bgCard }}>
          <span style={{ color:tk.textDim, fontSize:'12px' }}>
            Page {page} of {totalPages || 1}
          </span>
          <div style={{ display:'flex', gap:'6px' }}>
            {[{l:'«',a:()=>setPage(1),d:page<=1},{l:'‹',a:()=>setPage(p=>Math.max(1,p-1)),d:page<=1},
              {l:'›',a:()=>setPage(p=>Math.min(totalPages,p+1)),d:page>=totalPages},{l:'»',a:()=>setPage(totalPages),d:page>=totalPages}]
              .map(({l,a,d},i) => (
                <button key={i} onClick={a} disabled={d}
                  style={{ background:tk.bgInput, border:`1px solid ${tk.border}`, color:tk.textMuted,
                    padding:'5px 10px', borderRadius:'6px', cursor:d?'not-allowed':'pointer', fontSize:'12px', opacity:d?0.35:1 }}>
                  {l}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
