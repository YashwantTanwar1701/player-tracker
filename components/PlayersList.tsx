'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Player, PlayerTask, UserProfile, Status, Category, CATEGORIES, STATUSES, STATUS_COLOR } from '@/types'
import { useTheme, T } from '@/components/Dashboard'

const PAGE = 50
const DONE_STATUSES: Status[] = ['Yes', 'Already Updated', 'Not Found On Any Source', 'Player Not Found Online', 'Blocked']
const CORE_CATS = ['Date of Birth', 'Height & Weight', 'Hometown Update']

interface TournamentMeta {
  tournament_name:  string | null
  assigned_team:    string | null
  profile_pic_team: string | null
  is_active:        boolean | null
}

// ── TeamIdsCell ──────────────────────────────────────────────────────────────
function parseArray(val: string | null): number[] {
  if (!val) return []
  try { return JSON.parse(val) } catch { return val.replace(/[{}]/g,'').split(',').map(Number).filter(Boolean) }
}

function TeamIdsCell({ val }: { val: string | null }) {
  const theme = useTheme(); const tk = T[theme]
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const ids = parseArray(val)
  return (
    <span style={{ position:'relative', display:'inline-flex', alignItems:'center', gap:'3px' }}
      onMouseEnter={e => setPos({ x: e.clientX, y: e.clientY + 20 })}
      onMouseLeave={() => setPos(null)}>
      <span style={{ background:'#1d4ed8', color:'#fff', borderRadius:'99px', fontSize:'10px',
        fontWeight:700, padding:'1px 7px', cursor:'default' }}>
        {ids.length}
      </span>
      {pos && ids.length > 0 && (
        <div style={{ position:'fixed', left: Math.min(pos.x, window.innerWidth - 300), top: pos.y,
          zIndex: 99999, background: tk.bgCard, border:`1px solid ${tk.borderLight}`, borderRadius:'8px',
          padding:'10px 12px', width:'280px', boxShadow:'0 10px 40px rgba(0,0,0,0.9)', pointerEvents:'none' }}>
          <p style={{ color:tk.textMuted, fontSize:'10px', margin:'0 0 5px', fontWeight:700, textTransform:'uppercase' }}>
            Team IDs ({ids.length})
          </p>
          <div style={{ color:tk.text, fontSize:'12px', lineHeight:'1.7', maxHeight:'200px', overflowY:'auto', wordBreak:'break-all' }}>
            {ids.join(', ')}
          </div>
        </div>
      )}
    </span>
  )
}

// ── ProgressCell ─────────────────────────────────────────────────────────────
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
  const theme    = useTheme(); const tk = T[theme]
  const sc       = STATUS_COLOR[task?.status || 'Pending']
  const [open,   setOpen]   = useState(false)
  const [status, setStatus] = useState<Status>(task?.status || 'Pending')
  const [notes,  setNotes]  = useState(task?.notes || '')
  const [urls,   setUrls]   = useState<string[]>(task?.source_urls || [])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setStatus(task?.status || 'Pending')
    setNotes(task?.notes || '')
    setUrls(task?.source_urls || [])
  }, [task])

  if (readonly) {
    return (
      <span style={{ background:sc.bg, color:sc.text, fontSize:'11px', fontWeight:600,
        padding:'3px 9px', borderRadius:'99px', whiteSpace:'nowrap', display:'inline-block' }}>
        {task?.status || 'Pending'}
      </span>
    )
  }

  async function save() {
    setSaving(true)
    const now    = new Date().toISOString()
    const isDone = DONE_STATUSES.includes(status)
    const { data, error } = await supabase.from('player_tasks').upsert({
      player_id: player.player_id, category,
      status, notes, source_urls: urls,
      assigned_to: profile.id, operator_id: profile.id,
      operator_name: profile.full_name || profile.email,
      updated_by: profile.id,
      team: (profile.team === 'Cairo' || profile.team === 'India') ? profile.team : null,
      updated_at: now, completed_at: isDone ? now : null,
    }, { onConflict: 'player_id,category' }).select().single()
    if (!error && data) {
      await supabase.from('task_audit_log').insert({
        task_id: data.id, player_id: player.player_id, category,
        changed_by: profile.id, changed_by_name: profile.full_name || profile.email,
        changed_by_team: profile.team, old_status: task?.status || null, new_status: status,
        source_urls: urls,
      })
      onSaved(data as PlayerTask)
    }
    setSaving(false); setOpen(false)
  }

  const finp: React.CSSProperties = {
    width:'100%', background:tk.bgInput, border:`1px solid ${tk.border}`, borderRadius:'8px',
    padding:'8px 10px', color:tk.text, fontSize:'13px', outline:'none', boxSizing:'border-box',
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ background:sc.bg, color:sc.text, fontSize:'11px', fontWeight:600,
          padding:'3px 9px', borderRadius:'99px', border:'none', cursor:'pointer',
          whiteSpace:'nowrap', maxWidth:'150px', overflow:'hidden', textOverflow:'ellipsis' }}>
        {task?.status || 'Pending'}
      </button>
      {open && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
          onClick={e => { if(e.target===e.currentTarget) setOpen(false) }}>
          <div style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'16px',
            padding:'24px', width:'100%', maxWidth:'460px', display:'flex', flexDirection:'column', gap:'14px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <h3 style={{ color:tk.text, fontWeight:700, margin:0, fontSize:'15px' }}>{category}</h3>
                <p style={{ color:tk.textMuted, fontSize:'12px', margin:'3px 0 0' }}>{player.full_name}</p>
              </div>
              <button onClick={() => setOpen(false)}
                style={{ background:'none', border:'none', color:tk.textDim, cursor:'pointer', fontSize:'22px' }}>×</button>
            </div>
            <div>
              <label style={{ display:'block', color:tk.textMuted, fontSize:'11px', fontWeight:600,
                textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'6px' }}>Status</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                {STATUSES.map(s => (
                  <button key={s} onClick={() => setStatus(s)}
                    style={{ padding:'5px 12px', borderRadius:'99px', fontSize:'12px', fontWeight:600,
                      border:'none', cursor:'pointer',
                      background: status===s ? STATUS_COLOR[s].bg : tk.bgInput,
                      color: status===s ? STATUS_COLOR[s].text : tk.textMuted,
                      outline: status===s ? `2px solid ${STATUS_COLOR[s].text}` : 'none' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:'20px' }}>
              <label style={{ display:'block', color:tk.textMuted, fontSize:'11px', fontWeight:600,
                textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'6px' }}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Optional notes…" style={{ ...finp, resize:'vertical' }} />
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px' }}>
              <button onClick={() => setOpen(false)}
                style={{ background:tk.bgInput, border:`1px solid ${tk.borderLight}`, color:tk.textMuted,
                  padding:'9px 18px', borderRadius:'8px', cursor:'pointer', fontSize:'13px' }}>Cancel</button>
              <button onClick={save} disabled={saving}
                style={{ background:'#f97316', border:'none', color:'#fff', fontWeight:600,
                  padding:'9px 22px', borderRadius:'8px', cursor:'pointer', fontSize:'13px', opacity:saving?0.6:1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface Props { profile: UserProfile }

export default function PlayersList({ profile }: Props) {
  const supabase = createClient()
  const theme    = useTheme(); const tk = T[theme]

  const isAdmin = profile.role === 'admin' || profile.team === 'Admin'

  const [tournaments,      setTournaments]      = useState<TournamentMeta[]>([])
  const [tourReady,        setTourReady]        = useState(false)
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
  const [search,           setSearch]           = useState('')
  const [filterGender,     setFilterGender]     = useState<'All' | '1' | '2'>('All')
  const [filterStatus,     setFilterStatus]     = useState<Status | 'All'>('All')
  const [filterCat,        setFilterCat]        = useState<Category | 'All'>('All')
  const [filterTournament, setFilterTournament] = useState<string>('')

  // Load tournaments fresh (no cache)
  useEffect(() => {
    supabase.from('tournament_overview')
      .select('tournament_name, assigned_team, profile_pic_team, is_active')
      .then(({ data }) => {
        setTournaments((data || []) as TournamentMeta[])
        setTourReady(true)
      })
  }, [])

  // My visible tournaments (for operators: only their assigned ones)
  const myTours = tournaments.filter(t =>
    t.is_active !== false &&
    t.assigned_team !== null &&
    (isAdmin || t.assigned_team === profile.team)
  )

  useEffect(() => {
    if (!tourReady) return
    fetchPlayers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourReady, page, search, filterGender, filterStatus, filterCat, filterTournament, subTab])

  useEffect(() => { setPage(1) }, [search, filterGender, filterStatus, filterCat, filterTournament, subTab])

  async function fetchPlayers() {
    setLoading(true)
    setSelected(new Set())

    if (!isAdmin && myTours.length === 0) {
      setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
    }

    // ── Build tournament name list ──
    let tourNames: string[] | null = null

    if (filterTournament !== '') {
      // Specific tournament selected
      tourNames = filterTournament === 'NULL' ? [] : [filterTournament]
    } else if (!isAdmin) {
      // Operator sees only their assigned tournaments
      tourNames = myTours.map(t => t.tournament_name).filter(Boolean) as string[]
    } else {
      // Admin sees all assigned tournaments
      tourNames = myTours.map(t => t.tournament_name).filter(Boolean) as string[]
    }

    if (tourNames !== null && tourNames.length === 0) {
      setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
    }

    // ── Handle each sub-tab differently ──
    if (subTab === 'completed') {
      await fetchCompleted(tourNames)
      return
    }

    if (subTab === 'claimed') {
      await fetchClaimed(tourNames)
      return
    }

    // Available tab
    await fetchAvailable(tourNames)
  }

  // ── Available: players with ALL 3 core tasks Pending + unclaimed ──────────
  async function fetchAvailable(tourNames: string[] | null) {
    // Step 1: Get all tournament player IDs first
    let tourQ = supabase.from('players').select('player_id')
    if (tourNames && tourNames.length > 0) {
      tourQ = tourQ.in('player_last_match_tournament_name', tourNames)
    }
    if (search)                 tourQ = tourQ.ilike('full_name', `%${search}%`)
    if (filterGender !== 'All') tourQ = tourQ.eq('player_gender', parseInt(filterGender))

    const { data: tourPlayers } = await tourQ
    if (!tourPlayers || tourPlayers.length === 0) {
      setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
    }
    const tourIds = tourPlayers.map((p: any) => p.player_id as number)

    // Step 2: Get claimed/done IDs within these players (scoped to tour)
    const [{ data: claimedData }, { data: doneData }] = await Promise.all([
      supabase.from('player_tasks').select('player_id').in('category', CORE_CATS)
        .not('operator_id', 'is', null).in('player_id', tourIds),
      supabase.from('player_tasks').select('player_id').in('category', CORE_CATS)
        .not('status', 'in', '(Pending,In Progress)').in('player_id', tourIds),
    ])

    const excludeSet = new Set<number>([
      ...(claimedData || []).map((t: any) => t.player_id as number),
      ...(doneData    || []).map((t: any) => t.player_id as number),
    ])

    // Available IDs = tournament players minus claimed/done
    const availableIds = tourIds.filter(id => !excludeSet.has(id))
    const totalCount   = availableIds.length

    if (totalCount === 0) { setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return }

    // Step 3: Paginate from sorted available list
    const from    = (page - 1) * PAGE
    const pageIds = availableIds.slice(from, from + PAGE)

    const { data: playerData } = await supabase.from('players')
      .select('player_id,full_name,club_sweater_num,player_gender,height,weight,most_team_id,team_ids,last_team_id,last_team_name,player_last_match_name,player_last_match_tournament_name,player_last_match_season_name')
      .in('player_id', pageIds)
      .order('player_last_match_tournament_name', { ascending:true, nullsFirst:false })
      .order('last_team_name',                     { ascending:true, nullsFirst:false })
      .order('player_gender',                      { ascending:true, nullsFirst:false })
      .order('player_last_match_name',             { ascending:true, nullsFirst:false })

    const playerList = (playerData || []) as Player[]

    const taskMap: Record<string, PlayerTask> = {}
    if (playerList.length > 0) {
      const ids = playerList.map(p => p.player_id)
      const { data: td } = await supabase.from('player_tasks').select('*').in('player_id', ids)
      ;(td || []).forEach((t: PlayerTask) => { taskMap[`${t.player_id}__${t.category}`] = t })
    }

    setTasks(taskMap); setPlayers(playerList); setTotal(totalCount); setLoading(false)
  }

  // ── Claimed: players where this operator has claimed core tasks ───────────
  async function fetchClaimed(tourNames: string[] | null) {
    let tq = supabase.from('player_tasks')
      .select('player_id, category, status')
      .in('category', CORE_CATS)
      .not('operator_id', 'is', null)
      .not('status', 'in', '('+DONE_STATUSES.map(s=>`${s}`).join(',')+')') // only in-progress
    if (!isAdmin) tq = tq.eq('operator_id', profile.id)

    const { data: claimedTasks } = await tq
    if (!claimedTasks || claimedTasks.length === 0) {
      setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
    }

    // Keep players where at least 1 core task claimed and not all done
    const byPlayer: Record<number, Set<string>> = {}
    claimedTasks.forEach((t: any) => {
      if (!byPlayer[t.player_id]) byPlayer[t.player_id] = new Set()
      byPlayer[t.player_id].add(t.category)
    })
    const claimedIds = Object.keys(byPlayer).map(Number)

    let q = supabase.from('players')
      .select('player_id,full_name,club_sweater_num,player_gender,height,weight,most_team_id,team_ids,last_team_id,last_team_name,player_last_match_name,player_last_match_tournament_name,player_last_match_season_name', { count:'exact' })
      .in('player_id', claimedIds)

    if (tourNames && tourNames.length > 0) q = q.in('player_last_match_tournament_name', tourNames)
    if (search)                 q = q.ilike('full_name', `%${search}%`)
    if (filterGender !== 'All') q = q.eq('player_gender', parseInt(filterGender))

    const from = (page - 1) * PAGE
    const { data, count } = await q
      .order('player_last_match_tournament_name', { ascending:true, nullsFirst:false })
      .order('last_team_name',                     { ascending:true, nullsFirst:false })
      .range(from, from + PAGE - 1)

    const playerList = (data as Player[]) || []
    const taskMap: Record<string, PlayerTask> = {}
    if (playerList.length > 0) {
      const ids = playerList.map(p => p.player_id)
      const { data: td } = await supabase.from('player_tasks').select('*').in('player_id', ids)
      ;(td || []).forEach((t: PlayerTask) => { taskMap[`${t.player_id}__${t.category}`] = t })
    }

    setTasks(taskMap); setPlayers(playerList); setTotal(count || 0); setLoading(false)
  }

  // ── Completed: players where all 3 core tasks are done, sorted by completed_at DESC ──
  async function fetchCompleted(tourNames: string[] | null) {
    const { data: doneTasks } = await supabase
      .from('player_tasks')
      .select('player_id, category, completed_at, updated_at')
      .in('category', CORE_CATS)
      .not('status', 'in', '(Pending,In Progress)')
      .order('completed_at', { ascending:false, nullsFirst:false })
      .limit(5000)

    if (!doneTasks || doneTasks.length === 0) {
      setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
    }

    // Build: player_id → {cats done, max ts}
    const pMap: Record<number, { cats: Set<string>; ts: number }> = {}
    doneTasks.forEach((t: any) => {
      if (!pMap[t.player_id]) pMap[t.player_id] = { cats: new Set(), ts: 0 }
      pMap[t.player_id].cats.add(t.category)
      const ts = new Date(t.completed_at || t.updated_at || 0).getTime()
      if (ts > pMap[t.player_id].ts) pMap[t.player_id].ts = ts
    })

    const sortedIds = Object.entries(pMap)
      .filter(([, v]) => CORE_CATS.every(c => v.cats.has(c)))
      .sort(([, a], [, b]) => b.ts - a.ts)
      .map(([id]) => parseInt(id))

    if (sortedIds.length === 0) {
      setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
    }

    const from = (page - 1) * PAGE
    const pageIds = sortedIds.slice(from, from + PAGE)

    const { data: playerData } = await supabase.from('players')
      .select('player_id,full_name,club_sweater_num,player_gender,height,weight,most_team_id,team_ids,last_team_id,last_team_name,player_last_match_name,player_last_match_tournament_name,player_last_match_season_name')
      .in('player_id', pageIds)

    // Apply tournament + search filters
    let playerList = (playerData || []) as Player[]
    if (tourNames && tourNames.length > 0) {
      playerList = playerList.filter(p => tourNames.includes(p.player_last_match_tournament_name || ''))
    }
    if (search) {
      const s = search.toLowerCase()
      playerList = playerList.filter(p => p.full_name.toLowerCase().includes(s))
    }

    // Re-sort to match pre-sorted order
    const orderMap: Record<number, number> = {}
    pageIds.forEach((id, i) => { orderMap[id] = i })
    playerList.sort((a, b) => (orderMap[a.player_id] ?? 9999) - (orderMap[b.player_id] ?? 9999))

    const taskMap: Record<string, PlayerTask> = {}
    if (playerList.length > 0) {
      const ids = playerList.map(p => p.player_id)
      const { data: td } = await supabase.from('player_tasks').select('*').in('player_id', ids)
      ;(td || []).forEach((t: PlayerTask) => { taskMap[`${t.player_id}__${t.category}`] = t })
    }

    setTasks(taskMap); setPlayers(playerList); setTotal(sortedIds.length); setLoading(false)
  }

  // ── Task saved callback ───────────────────────────────────────────────────
  function handleTaskSaved(updated: PlayerTask) {
    const key = `${updated.player_id}__${updated.category}`
    setTasks(prev => ({ ...prev, [key]: updated }))

    // If all 3 core tasks now done → move to completed tab
    const newTasks = { ...tasks, [key]: updated }
    const dob = newTasks[`${updated.player_id}__Date of Birth`]
    const htw = newTasks[`${updated.player_id}__Height & Weight`]
    const htn = newTasks[`${updated.player_id}__Hometown Update`]
    const allDone = [dob, htw, htn].every(t => t && DONE_STATUSES.includes(t.status))
    if (allDone && subTab === 'claimed') {
      setPlayers(prev => prev.filter(p => p.player_id !== updated.player_id))
    }
  }

  // ── Claim ─────────────────────────────────────────────────────────────────
  async function claimSelected() {
    if (selected.size === 0) return
    setClaiming(true); setClaimMsg(null)
    const ids = Array.from(selected)
    const now = new Date().toISOString()
    const opName = profile.full_name || profile.email
    const opTeam = (profile.team === 'Cairo' || profile.team === 'India') ? profile.team : null

    const upserts: any[] = []
    for (const pid of ids) {
      for (const cat of CORE_CATS) {
        const existing = tasks[`${pid}__${cat}`]
        if (!existing || existing.status === 'Pending' || !existing.operator_id) {
          upserts.push({ player_id:pid, category:cat, status:'In Progress',
            assigned_to:profile.id, operator_id:profile.id, operator_name:opName,
            updated_by:profile.id, team:opTeam, updated_at:now })
        }
      }
    }

    if (upserts.length > 0) {
      const { error } = await supabase.from('player_tasks').upsert(upserts, { onConflict:'player_id,category' })
      if (error) console.error('Claim error:', error)
    }

    // Refresh tasks + remove claimed from available list
    const { data: td } = await supabase.from('player_tasks').select('*').in('player_id', ids)
    const newTasks = { ...tasks }
    ;(td || []).forEach((t: PlayerTask) => { newTasks[`${t.player_id}__${t.category}`] = t })
    setTasks(newTasks)
    setPlayers(prev => prev.filter(p => !new Set(ids).has(p.player_id)))
    setTotal(prev => Math.max(0, prev - ids.length))
    setClaimMsg(`✅ Claimed ${ids.length} player${ids.length > 1 ? 's' : ''} — check Claimed tab`)
    setSelected(new Set())
    setClaiming(false)
  }

  // ── Unclaim ───────────────────────────────────────────────────────────────
  async function unclaim(mode: 'selected' | 'all') {
    setClaiming(true); setClaimMsg(null)
    const now = new Date().toISOString()
    const reset = { status:'Pending', operator_id:null, operator_name:null, assigned_to:null, updated_at:now }

    if (mode === 'all') {
      let q = supabase.from('player_tasks').update(reset).in('category', CORE_CATS)
        .in('status', ['In Progress', 'Pending'])
      if (!isAdmin) q = q.eq('operator_id', profile.id)
      await q
      setClaimMsg('↩️ All claimed jobs moved back to Available')
    } else {
      const ids = Array.from(selected)
      if (ids.length === 0) { setClaiming(false); return }
      let q = supabase.from('player_tasks').update(reset).in('player_id', ids).in('category', CORE_CATS)
      if (!isAdmin) q = q.eq('operator_id', profile.id)
      await q
      setClaimMsg(`↩️ ${ids.length} player${ids.length > 1 ? 's' : ''} moved back to Available`)
    }

    setSelected(new Set()); setClaiming(false); setPage(1); setSubTab('available')
  }

  // ── Move completed back to available (admin) ──────────────────────────────
  async function moveCompletedToAvailable() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    const now = new Date().toISOString()
    await supabase.from('player_tasks')
      .update({ status:'Pending', operator_id:null, operator_name:null, assigned_to:null,
        completed_at:null, updated_at:now })
      .in('player_id', ids).in('category', CORE_CATS)
    setPlayers(prev => prev.filter(p => !new Set(ids).has(p.player_id)))
    setTotal(prev => Math.max(0, prev - ids.length))
    setSelected(new Set())
    setClaimMsg(`↩️ ${ids.length} player${ids.length > 1 ? 's' : ''} moved back to Available`)
  }

  // ── Save URL ──────────────────────────────────────────────────────────────
  async function saveUrl(playerId: number, existingUrls: string[], isReplace = false) {
    setSavingUrl(playerId)
    let newUrls: string[]
    if (isReplace) {
      newUrls = existingUrls
    } else {
      const url = editingUrl[String(playerId)]?.trim()
      if (!url) { setSavingUrl(null); return }
      newUrls = existingUrls.includes(url) ? existingUrls : [...existingUrls, url]
    }
    // Sync URL across all task categories for this player
    await supabase.from('player_tasks')
      .update({ source_urls: newUrls, updated_at: new Date().toISOString() })
      .eq('player_id', playerId)

    setTasks(prev => {
      const updated = { ...prev }
      CATEGORIES.forEach(c => {
        const k = `${playerId}__${c}`
        if (updated[k]) updated[k] = { ...updated[k], source_urls: newUrls }
      })
      return updated
    })
    setEditingUrl(prev => { const n = { ...prev }; delete n[String(playerId)]; return n })
    setSavingUrl(null)
  }

  function toggleAll() {
    setSelected(selected.size === players.length ? new Set() : new Set(players.map(p => p.player_id)))
  }
  function toggleSelect(id: number) {
    const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n)
  }

  // ── Styles ────────────────────────────────────────────────────────────────
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

  // No tournaments assigned
  if (tourReady && myTours.length === 0) return (
    <div style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'12px', padding:'48px', textAlign:'center' }}>
      <div style={{ fontSize:'32px', marginBottom:'12px' }}>📋</div>
      <h3 style={{ color:tk.text, fontWeight:600, margin:'0 0 8px' }}>No Competitions Assigned</h3>
      <p style={{ color:tk.textMuted, fontSize:'13px', margin:0 }}>
        {isAdmin ? 'Go to Tournaments tab and assign competitions to Cairo or India.'
          : `Ask your admin to assign competitions to ${profile.team} in the Tournaments tab.`}
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
          {loading ? 'Loading…' : `${total.toLocaleString('en-US')} players`}
        </span>
      </div>

      {/* Filters */}
      <div style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'12px', padding:'12px 16px' }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center' }}>
          <input type="text" placeholder="🔍 Search player name…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ ...inp, flex:1, minWidth:'180px' }} />

          {/* Tournament filter */}
          <select value={filterTournament} onChange={e => setFilterTournament(e.target.value)}
            style={{ ...inp, minWidth:'200px' }}>
            <option value="">
              {isAdmin ? `All Active Tournaments (${myTours.length})` : `My Tournaments (${profile.team}) — ${myTours.length}`}
            </option>
            {(isAdmin ? tournaments.filter(t => t.is_active !== false && t.assigned_team !== null) : myTours).map(t => (
              <option key={t.tournament_name ?? 'NULL'} value={t.tournament_name ?? 'NULL'}>
                {t.tournament_name ?? '(No Tournament)'} — {t.assigned_team}
              </option>
            ))}
          </select>

          <select value={filterGender} onChange={e => setFilterGender(e.target.value as any)} style={inp}>
            <option value="All">All Genders</option>
            <option value="1">Male</option>
            <option value="2">Female</option>
          </select>

          {isAdmin && (
            <select value={filterCat} onChange={e => setFilterCat(e.target.value as any)} style={inp}>
              <option value="All">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} style={inp}>
            <option value="All">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <button onClick={() => { setSearch(''); setFilterGender('All'); setFilterCat('All'); setFilterStatus('All'); setFilterTournament('') }}
            style={{ background:'none', border:'none', color:tk.textDim, cursor:'pointer', fontSize:'12px' }}>Clear</button>

          <button onClick={() => fetchPlayers()}
            title="Refresh" style={{ background:tk.bgInput, border:`1px solid ${tk.border}`, color:tk.textMuted,
              padding:'5px 10px', borderRadius:'7px', cursor:'pointer', fontSize:'12px' }}>🔄</button>
        </div>

        {/* Action bars */}
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
              {selected.size > 0 ? `${selected.size} selected` : 'Update statuses using the dropdowns on each row'}
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
                style={{ background:tk.bgInput, border:`1px solid ${tk.border}`, color:tk.textDim, fontWeight:600,
                  fontSize:'12px', padding:'6px 14px', borderRadius:'8px', cursor:'pointer' }}>
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
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'1800px' }}>
            <thead>
              <tr>
                {showCheckbox && <th style={{ ...th, width:'36px', textAlign:'center' }}>
                  <input type="checkbox" checked={players.length>0 && selected.size===players.length}
                    onChange={toggleAll} style={{ accentColor:'#f97316', cursor:'pointer' }} />
                </th>}
                <th style={th}>Player ID</th>
                <th style={{ ...th, textAlign:'center', width:'60px' }}>Photo</th>
                <th style={th}>Full Name</th>
                <th style={th}>#</th>
                <th style={th}>Gender</th>
                <th style={th}>HT</th>
                <th style={th}>WT</th>
                <th style={th}>Most Team</th>
                <th style={th}>Team IDs</th>
                <th style={th}>Last Team</th>
                <th style={th}>Last Match</th>
                <th style={th}>Tournament</th>
                <th style={th}>Season</th>
                <th style={th}>Operator</th>
                <th style={th}>Source URL</th>
                <th style={{ ...th, borderLeft:`2px solid ${tk.border}` }}>🗓 DOB</th>
                <th style={th}>📏 HT/WT</th>
                <th style={th}>🏠 Hometown</th>
                {subTab === 'completed' && <th style={th}>Completed At</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length:8 }).map((_,i) => (
                  <tr key={i}>{Array.from({ length:showCheckbox?20:19 }).map((_,j) => (
                    <td key={j} style={td}><div style={{ height:'12px', background:tk.tableRow, borderRadius:'4px' }}/></td>
                  ))}</tr>
                ))
              ) : players.length === 0 ? (
                <tr><td colSpan={showCheckbox?20:19}
                  style={{ ...td, textAlign:'center', color:tk.textFaint, padding:'48px' }}>
                  {subTab==='available' ? 'No unclaimed players — all claimed or completed! 🎉'
                    : subTab==='claimed' ? `No claimed players for ${profile.full_name || profile.email}`
                    : 'No completed players yet'}
                </td></tr>
              ) : players.map(player => {
                const dobTask = tasks[`${player.player_id}__Date of Birth`]
                const htwTask = tasks[`${player.player_id}__Height & Weight`]
                const htnTask = tasks[`${player.player_id}__Hometown Update`]
                const operatorName = dobTask?.operator_name || htwTask?.operator_name || htnTask?.operator_name || null
                const isSelected   = selected.has(player.player_id)
                const allDone      = [dobTask, htwTask, htnTask].every(t => t && DONE_STATUSES.includes(t.status))

                const allUrls = Array.from(new Set([
                  ...(tasks[`${player.player_id}__Date of Birth`]?.source_urls || []),
                  ...(tasks[`${player.player_id}__Height & Weight`]?.source_urls || []),
                  ...(tasks[`${player.player_id}__Hometown Update`]?.source_urls || []),
                ]))
                const urlVal  = editingUrl[String(player.player_id)] ?? ''
                const editKey = `edit_${player.player_id}`
                const editIdx = editingUrl[editKey] !== undefined ? parseInt(editingUrl[editKey]) : -1

                return (
                  <tr key={player.player_id}
                    style={{ background:isSelected?'rgba(249,115,22,0.08)':'transparent', transition:'background 0.1s' }}
                    onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background = tk.rowHover }}
                    onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background = 'transparent' }}>

                    {showCheckbox && (
                      <td style={{ ...td, textAlign:'center' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(player.player_id)}
                          style={{ accentColor:'#f97316', cursor:'pointer' }} />
                      </td>
                    )}

                    {/* Player ID */}
                    <td style={td}>
                      <div style={{ display:'flex', alignItems:'center', gap:'3px' }}>
                        <span onClick={() => navigator.clipboard.writeText(String(player.player_id))}
                          title="Click to copy" style={{ color:'#f97316', fontWeight:700, fontFamily:'monospace',
                            fontSize:'11px', cursor:'pointer', textDecoration:'underline dotted' }}>
                          {player.player_id}
                        </span>
                        <a href={`https://data.instatfootball.tv/hockeyplayers?dbs_id=${player.player_id}`}
                          target="_blank" rel="noreferrer"
                          style={{ color:'#f97316', textDecoration:'none', fontSize:'11px' }} title="Open in Instat">↗</a>
                      </div>
                    </td>

                    {/* Photo */}
                    <td style={{ ...td, textAlign:'center', width:'60px' }}>
                      <a href={`https://hockey.instatscout.com/images/players/180/${player.player_id}.png`}
                        target="_blank" rel="noreferrer">
                        <img src={`https://hockey.instatscout.com/images/players/180/${player.player_id}.png`}
                          alt={player.full_name}
                          onError={e => { (e.target as HTMLImageElement).src =
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(player.full_name)}&size=40&background=374151&color=9ca3af&bold=true&rounded=true` }}
                          style={{ width:'38px', height:'38px', borderRadius:'50%', objectFit:'cover',
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

                    <td style={{ ...td, fontSize:'11px' }}>{player.height || <span style={{ color:tk.borderLight }}>—</span>}</td>
                    <td style={{ ...td, fontSize:'11px' }}>{player.weight || <span style={{ color:tk.borderLight }}>—</span>}</td>

                    <td style={{ ...td, fontSize:'11px', color:tk.textDim }}>
                      {player.most_team_id || <span style={{ color:tk.borderLight }}>—</span>}
                    </td>

                    <td style={td}><TeamIdsCell val={player.team_ids} /></td>

                    <td style={{ ...td, maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {player.last_team_name || <span style={{ color:tk.borderLight }}>—</span>}
                    </td>

                    <td style={{ ...td, maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                      title={player.player_last_match_name || ''}>
                      {player.player_last_match_name || <span style={{ color:tk.borderLight }}>—</span>}
                    </td>

                    <td style={{ ...td, color:'#a78bfa', fontSize:'11px', whiteSpace:'nowrap' }}>
                      {player.player_last_match_tournament_name || <span style={{ color:tk.borderLight }}>—</span>}
                    </td>

                    <td style={{ ...td, fontSize:'11px', color:tk.textDim, whiteSpace:'nowrap' }}>
                      {player.player_last_match_season_name || <span style={{ color:tk.borderLight }}>—</span>}
                    </td>

                    {/* Operator */}
                    <td style={td}>
                      {operatorName
                        ? <span style={{ background:'#1e3a5f', color:'#93c5fd', fontSize:'11px', fontWeight:600,
                            padding:'2px 8px', borderRadius:'99px', whiteSpace:'nowrap' }}>👤 {operatorName}</span>
                        : <span style={{ color:tk.borderLight, fontSize:'11px' }}>—</span>}
                    </td>

                    {/* Source URL */}
                    <td style={{ ...td, minWidth:'200px' }}>
                      {allUrls.map((u, i) => (
                        editIdx === i ? (
                          <div key={i} style={{ display:'flex', gap:'3px', marginBottom:'3px' }}>
                            <input type="url" defaultValue={u} autoFocus id={`edit-url-${player.player_id}-${i}`}
                              onKeyDown={e => {
                                if (e.key==='Enter') { const v=(e.target as HTMLInputElement).value.trim(); if(v) saveUrl(player.player_id,allUrls.map((x,j)=>j===i?v:x),true); setEditingUrl(prev=>{const n={...prev};delete n[editKey];return n}) }
                                if (e.key==='Escape') setEditingUrl(prev=>{const n={...prev};delete n[editKey];return n})
                              }}
                              style={{ flex:1, background:'#1d4ed8', border:'1px solid #3b82f6', borderRadius:'4px', padding:'3px 6px', color:'#fff', fontSize:'10px', outline:'none', minWidth:0 }}/>
                            <button onClick={() => { const el=document.getElementById(`edit-url-${player.player_id}-${i}`) as HTMLInputElement; const v=el?.value.trim(); if(v) saveUrl(player.player_id,allUrls.map((x,j)=>j===i?v:x),true); setEditingUrl(prev=>{const n={...prev};delete n[editKey];return n}) }}
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
                            <button onClick={() => saveUrl(player.player_id,allUrls.filter((_,j)=>j!==i),true)}
                              style={{ background:'none', border:'none', color:tk.textFaint, cursor:'pointer', fontSize:'10px', padding:'1px 3px' }}>✕</button>
                          </div>
                        )
                      ))}
                      <div style={{ display:'flex', gap:'3px', marginTop:allUrls.length>0?'4px':'0' }}>
                        <input type="url" value={urlVal}
                          onChange={e => setEditingUrl(prev=>({...prev,[String(player.player_id)]:e.target.value}))}
                          onKeyDown={e => { if(e.key==='Enter'){e.preventDefault();saveUrl(player.player_id,allUrls)} }}
                          placeholder="Paste source URL…"
                          style={{ flex:1, background:tk.bgInput, border:`1px solid ${tk.border}`, borderRadius:'6px', padding:'4px 8px', color:tk.textMuted, fontSize:'11px', outline:'none', minWidth:0 }}/>
                        {urlVal && (
                          <button onClick={() => saveUrl(player.player_id,allUrls)} disabled={savingUrl===player.player_id}
                            style={{ background:'#1d4ed8', border:'none', color:'#fff', borderRadius:'5px', padding:'4px 8px', cursor:'pointer', fontSize:'11px', flexShrink:0 }}>
                            {savingUrl===player.player_id?'…':'＋'}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Progress cells */}
                    <td style={{ ...td, borderLeft:`2px solid ${tk.border}` }}>
                      <ProgressCell task={dobTask} category="Date of Birth" player={player} profile={profile} onSaved={handleTaskSaved} readonly={subTab==='available'} />
                    </td>
                    <td style={td}>
                      <ProgressCell task={htwTask} category="Height & Weight" player={player} profile={profile} onSaved={handleTaskSaved} readonly={subTab==='available'} />
                    </td>
                    <td style={td}>
                      <ProgressCell task={htnTask} category="Hometown Update" player={player} profile={profile} onSaved={handleTaskSaved} readonly={subTab==='available'} />
                    </td>

                    {subTab === 'completed' && (
                      <td style={{ ...td, whiteSpace:'nowrap', fontSize:'11px', color:tk.textDim }}>
                        {[dobTask, htwTask, htnTask].map(t => t?.completed_at || t?.updated_at).filter(Boolean).sort().reverse()[0]
                          ? new Date([dobTask, htwTask, htnTask].map(t => t?.completed_at || t?.updated_at).filter(Boolean).sort().reverse()[0]!)
                              .toLocaleString('en-IN', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false })
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
            {loading ? '…' : `${((page-1)*PAGE+1).toLocaleString()}–${Math.min(page*PAGE,total).toLocaleString()} of ${total.toLocaleString()}`}
          </span>
          <div style={{ display:'flex', gap:'6px' }}>
            {[{l:'«',a:()=>setPage(1),d:page<=1},{l:'‹',a:()=>setPage(p=>Math.max(1,p-1)),d:page<=1},
              {l:'›',a:()=>setPage(p=>Math.min(totalPages,p+1)),d:page>=totalPages},{l:'»',a:()=>setPage(totalPages),d:page>=totalPages}]
              .map(({l,a,d},i) => (
                <button key={i} onClick={a} disabled={d}
                  style={{ background:tk.bgInput, border:`1px solid ${tk.border}`, color:tk.textMuted,
                    padding:'5px 10px', borderRadius:'6px', cursor:d?'not-allowed':'pointer',
                    fontSize:'12px', opacity:d?0.35:1 }}>
                  {l}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
