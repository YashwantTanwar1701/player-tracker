'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Player, PlayerTask, UserProfile, Status, Category, CATEGORIES, STATUSES, STATUS_COLOR } from '@/types'
import { useTheme, T } from '@/components/Dashboard'

const PAGE       = 50
const COMP_LIMIT = 500  // cap for completed tab
const DONE: Status[] = ['Yes', 'Already Updated', 'Not Found On Any Source', 'Player Not Found Online', 'Blocked']
const CORE  = ['Date of Birth', 'Height & Weight', 'Hometown Update'] as const
const ALL4  = [...CORE, 'Profile Pic Update'] as const
type SubTab = 'available' | 'claimed' | 'completed'

interface TournamentMeta {
  tournament_name:  string | null
  assigned_team:    string | null
  is_active:        boolean | null
}

function parseArr(v: string | null): number[] {
  if (!v) return []
  try { return JSON.parse(v) } catch { return v.replace(/[{}]/g,'').split(',').map(Number).filter(Boolean) }
}

interface Props { profile: UserProfile }

export default function PlayersList({ profile }: Props) {
  const supabase = createClient()
  const theme = useTheme(); const tk = T[theme]
  const isAdmin = profile.role === 'admin' || profile.team === 'Admin'
  const opTeam  = (profile.team === 'Cairo' || profile.team === 'India') ? profile.team : null

  // ── State ──────────────────────────────────────────────────────────────────
  const [subTab,     setSubTab]     = useState<SubTab>('available')
  const [tours,      setTours]      = useState<TournamentMeta[]>([])
  const [tourReady,  setTourReady]  = useState(false)
  const [players,    setPlayers]    = useState<Player[]>([])
  const [tasks,      setTasks]      = useState<Record<string, PlayerTask>>({})
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(false)
  const [selected,   setSelected]   = useState<Set<number>>(new Set())
  const [claiming,   setClaiming]   = useState(false)
  const [msg,        setMsg]        = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [filterTour, setFilterTour] = useState('')
  const [filterGend, setFilterGend] = useState<'All'|'1'|'2'>('All')
  const [filterOp,   setFilterOp]   = useState('all')   // operator filter (admin)
  const [editUrl,    setEditUrl]    = useState<Record<string,string>>({})
  const [savingUrl,  setSavingUrl]  = useState<number|null>(null)
  const [openModal,  setOpenModal]  = useState<{player:Player;cat:Category}|null>(null)
  const [modalStatus,setModalStatus]= useState<Status>('Pending')
  const [modalNotes, setModalNotes] = useState('')
  const [savingModal,setSavingModal]= useState(false)

  // ── Tours ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('tournament_overview')
      .select('tournament_name, assigned_team, is_active')
      .then(({ data }) => { setTours((data||[]) as TournamentMeta[]); setTourReady(true) })
  }, [])

  const myTours = tours.filter(t =>
    t.is_active !== false && t.assigned_team !== null &&
    (isAdmin || t.assigned_team === profile.team)
  )

  // ── Operator list for filter ───────────────────────────────────────────────
  const opNames = Array.from(new Set(
    Object.values(tasks).map(t => t.operator_name).filter(Boolean)
  )) as string[]

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchPlayers = useCallback(async () => {
    setLoading(true); setSelected(new Set())
    if (!tourReady) { setLoading(false); return }
    if (!isAdmin && myTours.length === 0) { setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return }

    const tourNames = filterTour
      ? [filterTour]
      : myTours.map(t => t.tournament_name).filter(Boolean) as string[]

    if (tourNames.length === 0) { setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return }

    if (subTab === 'completed') { await doCompleted(tourNames); return }
    if (subTab === 'claimed')   { await doClaimed(tourNames);   return }
    await doAvailable(tourNames)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourReady, page, search, filterTour, filterGend, filterOp, subTab])

  useEffect(() => { fetchPlayers() }, [fetchPlayers])
  useEffect(() => { setPage(1) }, [search, filterTour, filterGend, filterOp, subTab])

  // ── Available ──────────────────────────────────────────────────────────────
  async function doAvailable(tourNames: string[]) {
    // Use Postgres RPC function — does the filtering server-side, no row limits
    const { data: availData, error } = await supabase
      .rpc('get_available_player_ids', { tour_names: tourNames })

    if (error) {
      console.error('get_available_player_ids error:', error)
      setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return
    }

    let availIds = (availData || []).map((r: any) => r.player_id as number)

    // Apply search + gender filter client-side (small result set after RPC)
    if (search || filterGend !== 'All') {
      // Need player details to filter — fetch names/genders for available IDs
      if (availIds.length > 0) {
        let fq = supabase.from('players').select('player_id, full_name, player_gender')
          .in('player_id', availIds.slice(0, 5000)) // safety cap
        if (search)               fq = fq.ilike('full_name', `%${search}%`)
        if (filterGend !== 'All') fq = fq.eq('player_gender', parseInt(filterGend))
        const { data: filtered } = await fq
        availIds = (filtered || []).map((p: any) => p.player_id as number)
      }
    }

    if (!availIds.length) { setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return }

    const from    = (page-1)*PAGE
    const pageIds = availIds.slice(from, from+PAGE)
    const { data: pd } = await supabase.from('players')
      .select('player_id,full_name,club_sweater_num,player_gender,height,weight,most_team_id,team_ids,last_team_id,last_team_name,player_last_match_name,player_last_match_tournament_name,player_last_match_season_name')
      .in('player_id', pageIds)
      .order('player_last_match_tournament_name',{ascending:true,nullsFirst:false})
      .order('last_team_name',{ascending:true,nullsFirst:false})
      .order('player_gender',{ascending:true,nullsFirst:false})
      .order('player_last_match_name',{ascending:true,nullsFirst:false})

    await loadTasks((pd||[]) as Player[], availIds.length)
  }

  // ── Claimed ────────────────────────────────────────────────────────────────
  async function doClaimed(tourNames: string[]) {
    let tq = supabase.from('player_tasks').select('player_id')
      .in('category', CORE).not('operator_id','is',null)
      .in('status', ['Pending','In Progress'])
    if (!isAdmin)           tq = tq.eq('operator_id', profile.id)
    else if (filterOp !== 'all') tq = tq.eq('operator_name', filterOp)

    const { data: claimedT } = await tq
    if (!claimedT?.length) { setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return }
    const claimedIds = Array.from(new Set(claimedT.map((t:any)=>t.player_id)))

    let q = supabase.from('players')
      .select('player_id,full_name,club_sweater_num,player_gender,height,weight,most_team_id,team_ids,last_team_id,last_team_name,player_last_match_name,player_last_match_tournament_name,player_last_match_season_name',{count:'exact'})
      .in('player_id', claimedIds)
      .in('player_last_match_tournament_name', tourNames)
    if (search) q = q.ilike('full_name',`%${search}%`)
    const from = (page-1)*PAGE
    const { data:pd, count } = await q
      .order('player_last_match_tournament_name',{ascending:true,nullsFirst:false})
      .order('last_team_name',{ascending:true,nullsFirst:false})
      .range(from, from+PAGE-1)
    await loadTasks((pd||[]) as Player[], count||0)
  }

  // ── Completed ──────────────────────────────────────────────────────────────
  async function doCompleted(tourNames: string[]) {
    // Cap at COMP_LIMIT rows for performance
    const { data: doneTasks } = await supabase
      .from('player_tasks').select('player_id, category, completed_at, updated_at')
      .in('category', CORE).not('status','in','(Pending,In Progress)')
      .order('completed_at',{ascending:false,nullsFirst:false})
      .limit(COMP_LIMIT * 3)  // fetch extra to account for deduplication

    if (!doneTasks?.length) { setPlayers([]); setTotal(0); setTasks({}); setLoading(false); return }

    // Group: player must have all 3 core done
    const pMap: Record<number,{cats:Set<string>;ts:number}> = {}
    doneTasks.forEach((t:any) => {
      if (!pMap[t.player_id]) pMap[t.player_id]={cats:new Set(),ts:0}
      pMap[t.player_id].cats.add(t.category)
      const ts = new Date(t.completed_at||t.updated_at||0).getTime()
      if (ts > pMap[t.player_id].ts) pMap[t.player_id].ts = ts
    })
    let sortedIds = Object.entries(pMap)
      .filter(([,v]) => CORE.every(c=>v.cats.has(c)))
      .sort(([,a],[,b])=>b.ts-a.ts)
      .map(([id])=>parseInt(id))
      .slice(0, COMP_LIMIT)

    // Apply operator filter for admin
    if (isAdmin && filterOp !== 'all') {
      const { data: opTasks } = await supabase.from('player_tasks')
        .select('player_id').in('category',CORE).eq('operator_name', filterOp)
        .in('player_id', sortedIds)
      const opIds = new Set((opTasks||[]).map((t:any)=>t.player_id))
      sortedIds = sortedIds.filter(id => opIds.has(id))
    }

    const from = (page-1)*PAGE
    const pageIds = sortedIds.slice(from, from+PAGE)
    const { data: pd } = await supabase.from('players')
      .select('player_id,full_name,club_sweater_num,player_gender,height,weight,most_team_id,team_ids,last_team_id,last_team_name,player_last_match_name,player_last_match_tournament_name,player_last_match_season_name')
      .in('player_id', pageIds)
      .in('player_last_match_tournament_name', tourNames)
    if (search) {
      const s = search.toLowerCase()
      const filtered = ((pd||[]) as Player[]).filter(p=>p.full_name.toLowerCase().includes(s))
      const orderMap: Record<number,number> = {}
      pageIds.forEach((id,i)=>{orderMap[id]=i})
      filtered.sort((a:any,b:any)=>(orderMap[a.player_id]??9999)-(orderMap[b.player_id]??9999))
      await loadTasks(filtered, sortedIds.length)
    } else {
      const playerList = ((pd||[]) as Player[])
      const orderMap: Record<number,number> = {}
      pageIds.forEach((id,i)=>{orderMap[id]=i})
      playerList.sort((a,b)=>(orderMap[a.player_id]??9999)-(orderMap[b.player_id]??9999))
      await loadTasks(playerList, sortedIds.length)
    }
  }

  // ── Load tasks for a page of players ──────────────────────────────────────
  async function loadTasks(playerList: Player[], totalCount: number) {
    const taskMap: Record<string,PlayerTask> = {}
    if (playerList.length > 0) {
      const ids = playerList.map(p=>p.player_id)
      const { data:td } = await supabase.from('player_tasks').select('*').in('player_id',ids)
      ;(td||[]).forEach((t:PlayerTask)=>{ taskMap[`${t.player_id}__${t.category}`]=t })
    }
    setPlayers(playerList); setTasks(taskMap); setTotal(totalCount); setLoading(false)
  }

  // ── Modal (status update) ─────────────────────────────────────────────────
  function openStatusModal(player: Player, cat: Category) {
    const t = tasks[`${player.player_id}__${cat}`]
    setOpenModal({player, cat})
    setModalStatus(t?.status || 'Pending')
    setModalNotes(t?.notes || '')
  }

  async function saveModal() {
    if (!openModal) return
    setSavingModal(true)
    const { player, cat } = openModal
    const now = new Date().toISOString()
    const isDone = DONE.includes(modalStatus)
    const existing = tasks[`${player.player_id}__${cat}`]

    const { data, error } = await supabase.from('player_tasks').upsert({
      player_id: player.player_id, category: cat,
      status: modalStatus, notes: modalNotes,
      source_urls: existing?.source_urls || [],
      assigned_to: profile.id, operator_id: profile.id,
      operator_name: profile.full_name || profile.email,
      updated_by: profile.id, team: opTeam,
      updated_at: now, completed_at: isDone ? now : null,
    }, { onConflict:'player_id,category' }).select().single()

    if (!error && data) {
      await supabase.from('task_audit_log').insert({
        task_id: data.id, player_id: player.player_id, category: cat,
        changed_by: profile.id, changed_by_name: profile.full_name||profile.email,
        changed_by_team: profile.team, old_status: existing?.status||null,
        new_status: modalStatus, source_urls: data.source_urls||[],
      })
      setTasks(prev => ({ ...prev, [`${player.player_id}__${cat}`]: data as PlayerTask }))
      // Move out of claimed if all core done
      if (subTab === 'claimed') {
        const newTasks = { ...tasks, [`${player.player_id}__${cat}`]: data as PlayerTask }
        const allCoreDone = CORE.every(c => {
          const t = newTasks[`${player.player_id}__${c}`]
          return t && DONE.includes(t.status)
        })
        if (allCoreDone) setPlayers(prev=>prev.filter(p=>p.player_id!==player.player_id))
      }
    }
    setSavingModal(false); setOpenModal(null)
  }

  // ── Claim ──────────────────────────────────────────────────────────────────
  async function claim() {
    if (!selected.size) return
    setClaiming(true); setMsg(null)
    const ids = Array.from(selected)
    const now = new Date().toISOString()
    const opLabel = profile.full_name || profile.email
    const ups: any[] = []
    for (const pid of ids) {
      for (const cat of ALL4) {
        const ex = tasks[`${pid}__${cat}`]
        if (!ex || ex.status === 'Pending' || !ex.operator_id) {
          ups.push({ player_id:pid, category:cat, status:'In Progress',
            assigned_to:profile.id, operator_id:profile.id, operator_name:opLabel,
            updated_by:profile.id, team:opTeam, updated_at:now })
        }
      }
    }
    if (ups.length) await supabase.from('player_tasks').upsert(ups,{onConflict:'player_id,category'})
    // Refresh tasks
    const { data:td } = await supabase.from('player_tasks').select('*').in('player_id',ids)
    const newTasks = {...tasks}
    ;(td||[]).forEach((t:PlayerTask)=>{newTasks[`${t.player_id}__${t.category}`]=t})
    setTasks(newTasks)
    setPlayers(prev=>prev.filter(p=>!new Set(ids).has(p.player_id)))
    setTotal(prev=>Math.max(0,prev-ids.length))
    setSelected(new Set()); setClaiming(false)
    setMsg(`✅ Claimed ${ids.length} player${ids.length>1?'s':''} — check Claimed tab`)
  }

  // ── Unclaim ────────────────────────────────────────────────────────────────
  async function unclaim(mode:'sel'|'all') {
    setClaiming(true); setMsg(null)
    const now = new Date().toISOString()
    const reset={status:'Pending',operator_id:null,operator_name:null,assigned_to:null,updated_at:now}
    if (mode==='all') {
      let q = supabase.from('player_tasks').update(reset).in('category',ALL4)
        .in('status',['In Progress','Pending'])
      if (!isAdmin) q = q.eq('operator_id',profile.id)
      await q
      setMsg('↩️ All moved back to Available')
    } else {
      const ids = Array.from(selected)
      if (!ids.length) { setClaiming(false); return }
      let q = supabase.from('player_tasks').update(reset).in('player_id',ids).in('category',ALL4)
      if (!isAdmin) q = q.eq('operator_id',profile.id)
      await q
      setMsg(`↩️ ${ids.length} player${ids.length>1?'s':''} moved back to Available`)
    }
    setSelected(new Set()); setClaiming(false); setPage(1); setSubTab('available')
  }

  async function moveToAvail() {
    const ids = Array.from(selected); if (!ids.length) return
    const now = new Date().toISOString()
    await supabase.from('player_tasks')
      .update({status:'Pending',operator_id:null,operator_name:null,assigned_to:null,completed_at:null,updated_at:now})
      .in('player_id',ids).in('category',ALL4)
    setPlayers(prev=>prev.filter(p=>!new Set(ids).has(p.player_id)))
    setTotal(prev=>Math.max(0,prev-ids.length))
    setSelected(new Set()); setMsg(`↩️ ${ids.length} moved back to Available`)
  }

  // ── Save URL ───────────────────────────────────────────────────────────────
  async function saveUrl(pid:number, existingUrls:string[], isReplace=false) {
    setSavingUrl(pid)
    let newUrls: string[]
    if (isReplace) { newUrls=existingUrls }
    else {
      const u = editUrl[String(pid)]?.trim()
      if (!u) { setSavingUrl(null); return }
      newUrls = existingUrls.includes(u)?existingUrls:[...existingUrls,u]
    }
    await supabase.from('player_tasks')
      .update({source_urls:newUrls,updated_at:new Date().toISOString()}).eq('player_id',pid)
    setTasks(prev=>{
      const n={...prev}
      ALL4.forEach(c=>{ const k=`${pid}__${c}`; if(n[k]) n[k]={...n[k],source_urls:newUrls} })
      return n
    })
    setEditUrl(prev=>{const n={...prev};delete n[String(pid)];return n})
    setSavingUrl(null)
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    background:tk.bgInput,border:`1px solid ${tk.border}`,borderRadius:'8px',
    padding:'7px 11px',color:tk.text,fontSize:'12px',outline:'none',
  }
  const th: React.CSSProperties = {
    padding:'8px 10px',color:tk.textDim,fontSize:'10px',fontWeight:700,
    textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'left',
    background:tk.tableHead,borderBottom:`1px solid ${tk.border}`,whiteSpace:'nowrap',
    position:'sticky',top:0,zIndex:10,
  }
  const td: React.CSSProperties = {
    padding:'8px 10px',borderBottom:`1px solid ${tk.tableRow}`,
    fontSize:'12px',color:tk.textMuted,verticalAlign:'middle',
  }

  if (tourReady && myTours.length===0) return (
    <div style={{background:tk.bgCard,border:`1px solid ${tk.border}`,borderRadius:'12px',padding:'48px',textAlign:'center'}}>
      <div style={{fontSize:'32px',marginBottom:'12px'}}>📋</div>
      <h3 style={{color:tk.text,fontWeight:600,margin:'0 0 8px'}}>No Competitions Assigned</h3>
      <p style={{color:tk.textMuted,fontSize:'13px',margin:0}}>
        {isAdmin ? 'Go to Tournaments tab and assign competitions to Cairo or India.'
          : `Ask your admin to assign competitions to ${profile.team} in the Tournaments tab.`}
      </p>
    </div>
  )

  const showCB = subTab==='available'||subTab==='claimed'||(subTab==='completed'&&isAdmin)
  const totalPages = Math.ceil(total/PAGE)

  // Status badge helper
  const badge = (task:PlayerTask|undefined, player:Player, cat:Category, editable:boolean) => {
    const sc = STATUS_COLOR[task?.status||'Pending']
    if (!editable) return (
      <span style={{background:sc.bg,color:sc.text,fontSize:'10px',fontWeight:600,
        padding:'2px 7px',borderRadius:'99px',whiteSpace:'nowrap',display:'inline-block'}}>{task?.status||'Pending'}</span>
    )
    return (
      <button onClick={()=>openStatusModal(player,cat)}
        style={{background:sc.bg,color:sc.text,fontSize:'10px',fontWeight:600,
          padding:'2px 7px',borderRadius:'99px',border:'none',cursor:'pointer',whiteSpace:'nowrap'}}>
        {task?.status||'Pending'}
      </button>
    )
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>

      {/* Sub-tabs */}
      <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
        {([['available','📋 Available','#374151'],['claimed','🙋 Claimed','#1d4ed8'],['completed','✅ Completed','#15803d']] as const).map(([k,l,col])=>(
          <button key={k} onClick={()=>setSubTab(k)}
            style={{padding:'8px 20px',borderRadius:'8px',border:'none',cursor:'pointer',fontSize:'13px',fontWeight:600,
              background:subTab===k?col:tk.bgInput,color:subTab===k?'#fff':tk.textMuted}}>
            {l}
          </button>
        ))}
        <span style={{color:tk.textDim,fontSize:'12px',marginLeft:'8px'}}>
          {loading?'Loading…':`${total.toLocaleString()} players`}
          {subTab==='completed'&&total>=COMP_LIMIT?` (capped at ${COMP_LIMIT})`:null}
        </span>
        <button onClick={()=>fetchPlayers()} title="Refresh this tab"
          style={{background:tk.bgInput,border:`1px solid ${tk.border}`,color:tk.textMuted,
            padding:'5px 10px',borderRadius:'7px',cursor:'pointer',fontSize:'12px',marginLeft:'auto'}}>
          🔄 Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{background:tk.bgCard,border:`1px solid ${tk.border}`,borderRadius:'12px',padding:'12px 16px'}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:'8px',alignItems:'center'}}>
          <input type="text" placeholder="🔍 Search player name…" value={search}
            onChange={e=>setSearch(e.target.value)} style={{...inp,flex:1,minWidth:'180px'}}/>

          <select value={filterTour} onChange={e=>setFilterTour(e.target.value)} style={{...inp,minWidth:'200px'}}>
            <option value="">All Tournaments ({myTours.length})</option>
            {(isAdmin?tours.filter(t=>t.is_active!==false&&t.assigned_team!==null):myTours).map(t=>(
              <option key={t.tournament_name??'NULL'} value={t.tournament_name??'NULL'}>
                {t.tournament_name??'(No Tournament)'} — {t.assigned_team}
              </option>
            ))}
          </select>

          <select value={filterGend} onChange={e=>setFilterGend(e.target.value as any)} style={inp}>
            <option value="All">All Genders</option>
            <option value="1">Male</option>
            <option value="2">Female</option>
          </select>

          {/* Operator filter — admin only, shown in claimed + completed */}
          {isAdmin && (subTab==='claimed'||subTab==='completed') && (
            <select value={filterOp} onChange={e=>setFilterOp(e.target.value)} style={{...inp,minWidth:'160px'}}>
              <option value="all">All Operators</option>
              {opNames.map(op=><option key={op} value={op}>{op}</option>)}
            </select>
          )}

          <button onClick={()=>{setSearch('');setFilterTour('');setFilterGend('All');setFilterOp('all')}}
            style={{background:'none',border:'none',color:tk.textDim,cursor:'pointer',fontSize:'12px'}}>Clear</button>
        </div>

        {/* Action bars */}
        {subTab==='available'&&selected.size>0&&(
          <div style={{marginTop:'10px',padding:'10px 14px',background:'#1e3a5f',borderRadius:'8px',
            border:'1px solid #1d4ed8',display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
            <span style={{color:'#93c5fd',fontSize:'13px',fontWeight:600}}>{selected.size} selected</span>
            <button onClick={claim} disabled={claiming}
              style={{background:'#f97316',border:'none',color:'#fff',fontWeight:700,fontSize:'13px',
                padding:'7px 18px',borderRadius:'8px',cursor:'pointer',opacity:claiming?0.6:1}}>
              {claiming?'Claiming…':`🙋 Claim ${selected.size} →`}
            </button>
            <button onClick={()=>setSelected(new Set())}
              style={{background:'none',border:`1px solid ${tk.border}`,color:tk.textMuted,
                fontSize:'12px',padding:'6px 12px',borderRadius:'8px',cursor:'pointer'}}>Deselect all</button>
            {msg&&<span style={{color:'#86efac',fontSize:'12px'}}>{msg}</span>}
          </div>
        )}
        {subTab==='claimed'&&(
          <div style={{marginTop:'10px',padding:'10px 14px',background:tk.bgInput,borderRadius:'8px',
            border:`1px solid ${tk.border}`,display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
            <span style={{color:tk.textMuted,fontSize:'12px'}}>
              {selected.size>0?`${selected.size} selected`:'Update statuses by clicking the status badges'}
            </span>
            <div style={{display:'flex',gap:'8px',marginLeft:'auto'}}>
              {selected.size>0&&<button onClick={()=>unclaim('sel')} disabled={claiming}
                style={{background:'#7c3aed',border:'none',color:'#fff',fontWeight:600,fontSize:'12px',
                  padding:'6px 14px',borderRadius:'8px',cursor:'pointer',opacity:claiming?0.6:1}}>
                {claiming?'…':`↩️ Unclaim (${selected.size})`}
              </button>}
              <button onClick={()=>unclaim('all')} disabled={claiming}
                style={{background:tk.bgInput,border:`1px solid ${tk.border}`,color:tk.textDim,
                  fontWeight:600,fontSize:'12px',padding:'6px 14px',borderRadius:'8px',cursor:'pointer'}}>
                ↩️ Move All → Available
              </button>
            </div>
            {msg&&<span style={{color:'#86efac',fontSize:'12px'}}>{msg}</span>}
          </div>
        )}
        {subTab==='completed'&&isAdmin&&selected.size>0&&(
          <div style={{marginTop:'10px',padding:'10px 14px',background:tk.bgInput,borderRadius:'8px',
            border:`1px solid ${tk.border}`,display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
            <span style={{color:tk.textMuted,fontSize:'12px'}}>{selected.size} selected</span>
            <button onClick={moveToAvail}
              style={{background:'#7c3aed',border:'none',color:'#fff',fontWeight:600,fontSize:'12px',
                padding:'6px 14px',borderRadius:'8px',cursor:'pointer',marginLeft:'auto'}}>
              ↩️ Move Selected Back to Available
            </button>
            {msg&&<span style={{color:'#86efac',fontSize:'12px'}}>{msg}</span>}
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{background:tk.bg,border:`1px solid ${tk.border}`,borderRadius:'12px',overflow:'hidden'}}>
        <div style={{overflowX:'auto',maxHeight:'calc(100vh - 280px)',overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:'1900px'}}>
            <thead>
              <tr>
                {showCB&&<th style={{...th,width:'36px',textAlign:'center'}}>
                  <input type="checkbox" checked={players.length>0&&selected.size===players.length}
                    onChange={()=>setSelected(selected.size===players.length?new Set():new Set(players.map(p=>p.player_id)))}
                    style={{accentColor:'#f97316',cursor:'pointer'}}/>
                </th>}
                <th style={th}>Player ID</th>
                <th style={{...th,textAlign:'center',width:'60px'}}>Photo</th>
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
                <th style={{...th,borderLeft:`2px solid ${tk.border}`}}>🗓 DOB</th>
                <th style={th}>📏 HT/WT</th>
                <th style={th}>🏠 Hometown</th>
                <th style={th}>📸 Pic</th>
                {subTab==='completed'&&<th style={th}>Completed At</th>}
              </tr>
            </thead>
            <tbody>
              {loading?(
                Array.from({length:8}).map((_,i)=>(
                  <tr key={i}>{Array.from({length:showCB?21:20}).map((_,j)=>(
                    <td key={j} style={td}><div style={{height:'12px',background:tk.tableRow,borderRadius:'4px'}}/></td>
                  ))}</tr>
                ))
              ):players.length===0?(
                <tr><td colSpan={showCB?21:20} style={{...td,textAlign:'center',color:tk.textFaint,padding:'48px'}}>
                  {subTab==='available'?'No unclaimed players — all claimed or completed! 🎉'
                    :subTab==='claimed'?`No claimed players${filterOp!=='all'?` for ${filterOp}`:''}`
                    :'No completed players yet'}
                </td></tr>
              ):players.map(player=>{
                const dob = tasks[`${player.player_id}__Date of Birth`]
                const htw = tasks[`${player.player_id}__Height & Weight`]
                const htn = tasks[`${player.player_id}__Hometown Update`]
                const pic = tasks[`${player.player_id}__Profile Pic Update`]
                const opName = dob?.operator_name||htw?.operator_name||htn?.operator_name||pic?.operator_name||null
                const isSel  = selected.has(player.player_id)
                const editable = subTab==='claimed'
                const allUrls = Array.from(new Set([
                  ...(dob?.source_urls||[]),...(htw?.source_urls||[]),
                  ...(htn?.source_urls||[]),...(pic?.source_urls||[])
                ]))
                const urlVal  = editUrl[String(player.player_id)]??''
                const editKey = `edit_${player.player_id}`
                const editIdx = editUrl[editKey]!==undefined?parseInt(editUrl[editKey]):-1

                return (
                  <tr key={player.player_id}
                    style={{background:isSel?'rgba(249,115,22,0.08)':'transparent',transition:'background 0.1s'}}
                    onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background=tk.rowHover}}
                    onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background='transparent'}}>

                    {showCB&&<td style={{...td,textAlign:'center'}}>
                      <input type="checkbox" checked={isSel}
                        onChange={()=>{const n=new Set(selected);n.has(player.player_id)?n.delete(player.player_id):n.add(player.player_id);setSelected(n)}}
                        style={{accentColor:'#f97316',cursor:'pointer'}}/>
                    </td>}

                    <td style={td}>
                      <div style={{display:'flex',alignItems:'center',gap:'3px'}}>
                        <span onClick={()=>navigator.clipboard.writeText(String(player.player_id))}
                          title="Copy ID" style={{color:'#f97316',fontWeight:700,fontFamily:'monospace',
                            fontSize:'11px',cursor:'pointer',textDecoration:'underline dotted'}}>
                          {player.player_id}
                        </span>
                        <a href={`https://data.instatfootball.tv/hockeyplayers?dbs_id=${player.player_id}`}
                          target="_blank" rel="noreferrer"
                          style={{color:'#f97316',textDecoration:'none',fontSize:'11px'}} title="Instat">↗</a>
                      </div>
                    </td>

                    <td style={{...td,textAlign:'center'}}>
                      <a href={`https://hockey.instatscout.com/images/players/180/${player.player_id}.png`}
                        target="_blank" rel="noreferrer">
                        <img src={`https://hockey.instatscout.com/images/players/180/${player.player_id}.png`}
                          alt={player.full_name}
                          onError={e=>{(e.target as HTMLImageElement).src=`https://ui-avatars.com/api/?name=${encodeURIComponent(player.full_name)}&size=40&background=374151&color=9ca3af&bold=true&rounded=true`}}
                          style={{width:'36px',height:'36px',borderRadius:'50%',objectFit:'cover',border:`2px solid ${tk.border}`,display:'block',margin:'0 auto'}}/>
                      </a>
                    </td>

                    <td style={{...td,fontWeight:600,whiteSpace:'nowrap'}}>
                      <a href={`https://www.google.com/search?q=${encodeURIComponent(`${player.full_name} ${player.last_team_name||''}`.trim())}`}
                        target="_blank" rel="noreferrer"
                        style={{color:tk.text,textDecoration:'none'}}
                        onMouseEnter={e=>(e.currentTarget.style.textDecoration='underline')}
                        onMouseLeave={e=>(e.currentTarget.style.textDecoration='none')}>
                        {player.full_name}
                      </a>
                    </td>

                    <td style={{...td,textAlign:'center'}}>
                      {player.club_sweater_num!=null
                        ?<span style={{background:tk.tableHead,padding:'2px 5px',borderRadius:'4px',fontWeight:600,color:tk.text,fontSize:'11px'}}>{player.club_sweater_num}</span>
                        :<span style={{color:tk.borderLight}}>—</span>}
                    </td>

                    <td style={td}>
                      {player.player_gender!=null
                        ?<span style={{color:player.player_gender===1?'#60a5fa':'#f472b6',fontSize:'11px',fontWeight:600}}>
                            {player.player_gender===1?'M':'F'}
                          </span>
                        :<span style={{color:tk.borderLight}}>—</span>}
                    </td>

                    <td style={{...td,fontSize:'11px'}}>{player.height||<span style={{color:tk.borderLight}}>—</span>}</td>
                    <td style={{...td,fontSize:'11px'}}>{player.weight||<span style={{color:tk.borderLight}}>—</span>}</td>
                    <td style={{...td,fontSize:'11px',color:tk.textDim}}>{player.most_team_id||<span style={{color:tk.borderLight}}>—</span>}</td>
                    <td style={td}>
                      {(()=>{
                        const ids=parseArr(player.team_ids)
                        return ids.length>0
                          ?<span style={{background:'#1d4ed8',color:'#fff',borderRadius:'99px',fontSize:'10px',fontWeight:700,padding:'1px 7px'}}>{ids.length}</span>
                          :<span style={{color:tk.borderLight}}>—</span>
                      })()}
                    </td>
                    <td style={{...td,maxWidth:'140px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{player.last_team_name||<span style={{color:tk.borderLight}}>—</span>}</td>
                    <td style={{...td,maxWidth:'140px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={player.player_last_match_name||''}>{player.player_last_match_name||<span style={{color:tk.borderLight}}>—</span>}</td>
                    <td style={{...td,color:'#a78bfa',fontSize:'11px',whiteSpace:'nowrap'}}>{player.player_last_match_tournament_name||<span style={{color:tk.borderLight}}>—</span>}</td>
                    <td style={{...td,fontSize:'11px',color:tk.textDim,whiteSpace:'nowrap'}}>{player.player_last_match_season_name||<span style={{color:tk.borderLight}}>—</span>}</td>

                    <td style={td}>
                      {opName?<span style={{background:'#1e3a5f',color:'#93c5fd',fontSize:'11px',fontWeight:600,padding:'2px 7px',borderRadius:'99px',whiteSpace:'nowrap'}}>👤 {opName}</span>
                        :<span style={{color:tk.borderLight,fontSize:'11px'}}>—</span>}
                    </td>

                    {/* Source URL */}
                    <td style={{...td,minWidth:'180px'}}>
                      {allUrls.map((u,i)=>(
                        editIdx===i?(
                          <div key={i} style={{display:'flex',gap:'3px',marginBottom:'3px'}}>
                            <input type="url" defaultValue={u} autoFocus id={`eu-${player.player_id}-${i}`}
                              onKeyDown={e=>{
                                if(e.key==='Enter'){const v=(e.target as HTMLInputElement).value.trim();if(v)saveUrl(player.player_id,allUrls.map((x,j)=>j===i?v:x),true);setEditUrl(p=>{const n={...p};delete n[editKey];return n})}
                                if(e.key==='Escape')setEditUrl(p=>{const n={...p};delete n[editKey];return n})
                              }}
                              style={{flex:1,background:'#1d4ed8',border:'1px solid #3b82f6',borderRadius:'4px',padding:'3px 6px',color:'#fff',fontSize:'10px',outline:'none',minWidth:0}}/>
                            <button onClick={()=>{const el=document.getElementById(`eu-${player.player_id}-${i}`) as HTMLInputElement;const v=el?.value.trim();if(v)saveUrl(player.player_id,allUrls.map((x,j)=>j===i?v:x),true);setEditUrl(p=>{const n={...p};delete n[editKey];return n})}}
                              style={{background:'#15803d',border:'none',color:'#fff',borderRadius:'4px',padding:'3px 6px',cursor:'pointer',fontSize:'10px'}}>✓</button>
                            <button onClick={()=>setEditUrl(p=>{const n={...p};delete n[editKey];return n})}
                              style={{background:tk.borderLight,border:'none',color:tk.textMuted,borderRadius:'4px',padding:'3px 5px',cursor:'pointer',fontSize:'10px'}}>✕</button>
                          </div>
                        ):(
                          <div key={i} style={{display:'flex',alignItems:'center',gap:'3px',marginBottom:'2px'}}>
                            <a href={u} target="_blank" rel="noreferrer"
                              style={{color:'#60a5fa',fontSize:'10px',textDecoration:'none',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,minWidth:0}} title={u}>
                              🔗 {u.replace(/^https?:\/\//,'').substring(0,22)}…
                            </a>
                            <button onClick={()=>setEditUrl(p=>({...p,[editKey]:String(i)}))}
                              style={{background:'none',border:'none',color:tk.textFaint,cursor:'pointer',fontSize:'11px',padding:'1px 3px'}}>✏️</button>
                            <button onClick={()=>saveUrl(player.player_id,allUrls.filter((_,j)=>j!==i),true)}
                              style={{background:'none',border:'none',color:tk.textFaint,cursor:'pointer',fontSize:'10px',padding:'1px 3px'}}>✕</button>
                          </div>
                        )
                      ))}
                      <div style={{display:'flex',gap:'3px',marginTop:allUrls.length>0?'4px':'0'}}>
                        <input type="url" value={urlVal}
                          onChange={e=>setEditUrl(p=>({...p,[String(player.player_id)]:e.target.value}))}
                          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();saveUrl(player.player_id,allUrls)}}}
                          placeholder="Paste URL…"
                          style={{flex:1,background:tk.bgInput,border:`1px solid ${tk.border}`,borderRadius:'6px',padding:'3px 7px',color:tk.textMuted,fontSize:'11px',outline:'none',minWidth:0}}/>
                        {urlVal&&<button onClick={()=>saveUrl(player.player_id,allUrls)} disabled={savingUrl===player.player_id}
                          style={{background:'#1d4ed8',border:'none',color:'#fff',borderRadius:'5px',padding:'3px 7px',cursor:'pointer',fontSize:'11px',flexShrink:0}}>
                          {savingUrl===player.player_id?'…':'＋'}
                        </button>}
                      </div>
                    </td>

                    {/* 4 status columns */}
                    <td style={{...td,borderLeft:`2px solid ${tk.border}`}}>{badge(dob,player,'Date of Birth',editable)}</td>
                    <td style={td}>{badge(htw,player,'Height & Weight',editable)}</td>
                    <td style={td}>{badge(htn,player,'Hometown Update',editable)}</td>
                    <td style={td}>{badge(pic,player,'Profile Pic Update',editable)}</td>

                    {subTab==='completed'&&<td style={{...td,whiteSpace:'nowrap',fontSize:'11px',color:tk.textDim}}>
                      {[dob,htw,htn].map(t=>t?.completed_at||t?.updated_at).filter(Boolean).sort().reverse()[0]
                        ?new Date([dob,htw,htn].map(t=>t?.completed_at||t?.updated_at).filter(Boolean).sort().reverse()[0]!)
                            .toLocaleString('en-IN',{day:'2-digit',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
                        :'—'}
                    </td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
          padding:'10px 16px',borderTop:`1px solid ${tk.border}`,background:tk.bgCard}}>
          <span style={{color:tk.textDim,fontSize:'12px'}}>
            {loading?'…':`${((page-1)*PAGE+1).toLocaleString()}–${Math.min(page*PAGE,total).toLocaleString()} of ${total.toLocaleString()}`}
          </span>
          <div style={{display:'flex',gap:'6px'}}>
            {[{l:'«',a:()=>setPage(1),d:page<=1},{l:'‹',a:()=>setPage(p=>Math.max(1,p-1)),d:page<=1},
              {l:'›',a:()=>setPage(p=>Math.min(totalPages,p+1)),d:page>=totalPages},{l:'»',a:()=>setPage(totalPages),d:page>=totalPages}]
              .map(({l,a,d},i)=>(
                <button key={i} onClick={a} disabled={d}
                  style={{background:tk.bgInput,border:`1px solid ${tk.border}`,color:tk.textMuted,
                    padding:'5px 10px',borderRadius:'6px',cursor:d?'not-allowed':'pointer',fontSize:'12px',opacity:d?0.35:1}}>
                  {l}
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Status modal */}
      {openModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:9999,
          display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}
          onClick={e=>{if(e.target===e.currentTarget)setOpenModal(null)}}>
          <div style={{background:tk.bgCard,border:`1px solid ${tk.border}`,borderRadius:'16px',
            padding:'24px',width:'100%',maxWidth:'460px',display:'flex',flexDirection:'column',gap:'14px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <h3 style={{color:tk.text,fontWeight:700,margin:0,fontSize:'15px'}}>{openModal.cat}</h3>
                <p style={{color:tk.textMuted,fontSize:'12px',margin:'3px 0 0'}}>{openModal.player.full_name}</p>
              </div>
              <button onClick={()=>setOpenModal(null)}
                style={{background:'none',border:'none',color:tk.textDim,cursor:'pointer',fontSize:'22px'}}>×</button>
            </div>

            <div>
              <label style={{display:'block',color:tk.textMuted,fontSize:'11px',fontWeight:600,
                textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'6px'}}>Status</label>
              <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                {STATUSES.map(s=>(
                  <button key={s} onClick={()=>setModalStatus(s)}
                    style={{padding:'5px 12px',borderRadius:'99px',fontSize:'12px',fontWeight:600,
                      border:'none',cursor:'pointer',
                      background:modalStatus===s?STATUS_COLOR[s].bg:tk.bgInput,
                      color:modalStatus===s?STATUS_COLOR[s].text:tk.textMuted,
                      outline:modalStatus===s?`2px solid ${STATUS_COLOR[s].text}`:'none'}}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{display:'block',color:tk.textMuted,fontSize:'11px',fontWeight:600,
                textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'6px'}}>Notes</label>
              <textarea value={modalNotes} onChange={e=>setModalNotes(e.target.value)} rows={3}
                placeholder="Optional notes…"
                style={{width:'100%',background:tk.bgInput,border:`1px solid ${tk.border}`,borderRadius:'8px',
                  padding:'8px 10px',color:tk.text,fontSize:'13px',outline:'none',resize:'vertical',boxSizing:'border-box'}}/>
            </div>

            <div style={{display:'flex',justifyContent:'flex-end',gap:'10px'}}>
              <button onClick={()=>setOpenModal(null)}
                style={{background:tk.bgInput,border:`1px solid ${tk.border}`,color:tk.textMuted,
                  padding:'9px 18px',borderRadius:'8px',cursor:'pointer',fontSize:'13px'}}>Cancel</button>
              <button onClick={saveModal} disabled={savingModal}
                style={{background:'#f97316',border:'none',color:'#fff',fontWeight:600,
                  padding:'9px 22px',borderRadius:'8px',cursor:'pointer',fontSize:'13px',opacity:savingModal?0.6:1}}>
                {savingModal?'Saving…':'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
