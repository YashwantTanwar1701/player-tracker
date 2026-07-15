'use client'
import { useTheme, T } from '@/components/Dashboard'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cache, TTL } from '@/lib/cache'
import { UserProfile, Team, TEAM_COLOR } from '@/types'

interface TournamentRow {
  tournament_name:  string | null
  player_count:     number
  assigned_team:    Team | null
  is_active:        boolean | null
  assigned_by_name: string | null
  assigned_at:      string | null
  dob_pending:      number
  htw_pending:      number
  htn_pending:      number
  pic_pending:      number
  total_done:       number
  total_tasks:      number
}

interface Props { profile: UserProfile }

export default function Tournaments({ profile }: Props) {
  const supabase = createClient()
  const theme = useTheme()
  const tk    = T[theme]
  const [rows,    setRows]    = useState<TournamentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<string | null>(null)
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState<'All' | 'Active' | 'Cairo' | 'India' | 'Unassigned'>('All')
  const [msg,     setMsg]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)

    // Check cache first
    const cached = cache.get<TournamentRow[]>('tournament_rows')
    if (cached) { setRows(cached); setLoading(false); return }

    // Step 1: Fast query — just the assignments table (no JOINs)
    const { data: assignments, error } = await supabase
      .from('tournament_assignments')
      .select('tournament_name, assigned_team, is_active, assigned_by_name, updated_at, player_count')
      .order('assigned_team', { ascending: true, nullsFirst: false })

    if (error || !assignments) {
      console.error('Tournament load error:', error)
      setLoading(false)
      return
    }

    // Step 2: Get all tournament names + counts via fast RPC function
    const { data: tourList } = await supabase.rpc('get_tournament_list')

    const allTourNames = (tourList || []).map((t: any) => t.tournament_name as string | null)
    const playerCountMap: Record<string, number> = {}
    ;(tourList || []).forEach((t: any) => {
      const key = t.tournament_name ?? '__NULL__'
      playerCountMap[key] = Number(t.player_count) || 0
    })

    // Build map of assignments for quick lookup
    const assignMap: Record<string, any> = {}
    assignments.forEach((a: any) => {
      assignMap[a.tournament_name ?? '__NULL__'] = a
    })

    // Build rows: assigned tournaments + unassigned ones from players
    const rows: TournamentRow[] = allTourNames.map((name: string | null) => {
      const key = name ?? '__NULL__'
      const a = assignMap[key]
      return {
        tournament_name:  name,
        player_count:     playerCountMap[key] || a?.player_count || 0,
        assigned_team:    a?.assigned_team || null,
        is_active:        a?.is_active ?? null,
        assigned_by_name: a?.assigned_by_name || null,
        assigned_at:      a?.updated_at || null,
        dob_pending:      0,
        htw_pending:      0,
        htn_pending:      0,
        pic_pending:      0,
        total_done:       0,
        total_tasks:      0,
      }
    }).sort((a: TournamentRow, b: TournamentRow) => {
      // Unassigned first, assigned last
      const aAssigned = a.assigned_team ? 1 : 0
      const bAssigned = b.assigned_team ? 1 : 0
      if (aAssigned !== bAssigned) return aAssigned - bAssigned
      // Within each group, sort by player count DESC
      return b.player_count - a.player_count
    })

    cache.set('tournament_rows', rows, TTL.TOURNAMENTS)
    setRows(rows)
    setLoading(false)

    // Step 3: Load progress counts in background via fast RPC
    try {
      const { data: progress } = await supabase.rpc('get_tournament_progress')
      if (progress) {
        const progressMap: Record<string, any> = {}
        progress.forEach((r: any) => { progressMap[r.tournament_name ?? '__NULL__'] = r })
        setRows(prev => {
          const updated = prev.map(r => {
            const key = r.tournament_name ?? '__NULL__'
            const p = progressMap[key]
            return p ? { ...r,
              total_done:  Number(p.total_done)  || 0,
              total_tasks: Number(p.total_tasks) || 0,
            } : r
          })
          // Re-sort by player count DESC after enrichment
          return updated.sort((a, b) => b.player_count - a.player_count)
        })
      }
    } catch (e) {
      console.warn('Background progress load failed:', e)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Safe upsert: DELETE then INSERT to handle NULL tournament_name correctly
  // (SQL upsert ON CONFLICT doesn't work with NULL values)
  async function upsertTournament(tournamentName: string | null, patch: Record<string, any>) {
    const key = tournamentName ?? '__NULL__'
    setSaving(key); setMsg(null)

    // Step 1: delete existing row for this tournament
    let delQuery = supabase.from('tournament_assignments').delete()
    if (tournamentName === null) {
      delQuery = delQuery.is('tournament_name', null) as any
    } else {
      delQuery = delQuery.eq('tournament_name', tournamentName) as any
    }
    await delQuery

    // Step 2: insert fresh row with all fields merged
    const currentRow = rows.find(r => r.tournament_name === tournamentName)
    const payload: Record<string, any> = {
      assigned_by:      profile.id,
      assigned_by_name: profile.full_name || profile.email,
      updated_at:       new Date().toISOString(),
      // Keep existing values unless overridden by patch
      assigned_team:    currentRow?.assigned_team    ?? null,
      is_active:        currentRow?.is_active        ?? true,
      ...patch,
    }
    // Only set tournament_name if not null (null is the default/absence)
    if (tournamentName !== null) {
      payload.tournament_name = tournamentName
    }

    const { error } = await supabase.from('tournament_assignments').insert(payload)
    if (error) { setMsg({ type: 'err', text: error.message }); setSaving(null); return false }
    return true
  }

  async function assignTeam(tournamentName: string | null, team: Team | null) {
    const key     = tournamentName ?? '__NULL__'
    const current = rows.find(r => r.tournament_name === tournamentName)

    if (team === null) {
      // Remove assignment
      if (tournamentName === null) await supabase.from('tournament_assignments').delete().is('tournament_name', null)
      else await supabase.from('tournament_assignments').delete().eq('tournament_name', tournamentName)
      cache.invalidate('tournament'); cache.invalidate('avail:')
    setRows(prev => prev.map(r => r.tournament_name === tournamentName
        ? { ...r, assigned_team: null, assigned_by_name: null, assigned_at: null } : r))
      setSaving(null); return
    }

    const ok = await upsertTournament(tournamentName, { assigned_team: team, is_active: current?.is_active ?? true })
    if (!ok) return

    // Update pending player_tasks.team
    let pq = supabase.from('players').select('player_id')
    if (tournamentName === null) pq = pq.is('player_last_match_tournament_name', null)
    else pq = pq.eq('player_last_match_tournament_name', tournamentName)
    const { data: pData } = await pq
    const ids = (pData || []).map((p: any) => p.player_id)
    if (ids.length > 0) await supabase.from('player_tasks').update({ team }).in('player_id', ids).eq('status', 'Pending')

    cache.invalidate('tournament'); cache.invalidate('avail:')
    setRows(prev => prev.map(r => r.tournament_name === tournamentName
      ? { ...r, assigned_team: team, assigned_by_name: profile.full_name || profile.email, assigned_at: new Date().toISOString() } : r))
    setMsg({ type: 'ok', text: `✅ "${tournamentName ?? 'No Tournament'}" → ${team} (${ids.length} players)` })
    setSaving(null)
  }

  async function toggleActive(tournamentName: string | null, current: boolean | null) {
    const newVal = !(current ?? true)
    const row    = rows.find(r => r.tournament_name === tournamentName)
    const ok     = await upsertTournament(tournamentName, {
      is_active:        newVal,
      assigned_team:    row?.assigned_team,
        })
    if (!ok) return
    cache.invalidate('tournament'); cache.invalidate('avail:')
    setRows(prev => prev.map(r => r.tournament_name === tournamentName ? { ...r, is_active: newVal } : r))
    setMsg({ type: 'ok', text: `${newVal ? '✅ Activated' : '⏸ Deactivated'}: "${tournamentName ?? 'No Tournament'}"` })
    setSaving(null)
  }

  const filtered = rows.filter(r => {
    const name = r.tournament_name ?? ''
    const matchSearch = search === '' || name.toLowerCase().includes(search.toLowerCase())
    const isActive    = r.is_active !== false
    const matchFilter =
      filter === 'All'        ? true :
      filter === 'Active'     ? isActive :
      filter === 'Unassigned' ? !r.assigned_team :
                                r.assigned_team === filter
    return matchSearch && matchFilter
  })

  const totalCairo      = rows.filter(r => r.assigned_team === 'Cairo').reduce((s, r) => s + r.player_count, 0)
  const totalIndia      = rows.filter(r => r.assigned_team === 'India').reduce((s, r) => s + r.player_count, 0)
  const totalUnassigned = rows.filter(r => !r.assigned_team).reduce((s, r) => s + r.player_count, 0)
  const activeCount     = rows.filter(r => r.is_active !== false && r.assigned_team).length

  const inp: React.CSSProperties = {
    background: tk.bgInput, border: `1px solid ${tk.borderLight}`, borderRadius: '8px',
    padding: '7px 12px', color: tk.text, fontSize: '13px', outline: 'none',
  }
  const th: React.CSSProperties = {
    padding: '10px 10px', color: tk.textDim, fontSize: '10px', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left',
    background: tk.tableHead, borderBottom: `1px solid ${tk.border}`, whiteSpace: 'nowrap',
    position: 'sticky', top: 0,
  }
  const td: React.CSSProperties = {
    padding: '10px 10px', borderBottom: `1px solid ${tk.tableRow}`,
    fontSize: '12px', color: tk.textMuted, verticalAlign: 'middle',
  }



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '12px' }}>
        {[
          { label: 'Active Competitions', value: activeCount,       color: '#34d399', icon: '✅' },
          { label: 'Total Competitions',  value: rows.length,       color: tk.text,    icon: '🏆' },
          { label: 'Cairo Players',       value: totalCairo,        color: '#f97316', icon: '🟠' },
          { label: 'India Players',       value: totalIndia,        color: '#3b82f6', icon: '🔵' },
          { label: 'Unassigned Players',  value: totalUnassigned,   color: tk.textMuted, icon: '⚪' },
        ].map(k => (
          <div key={k.label} style={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: tk.textDim, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</span>
              <span style={{ fontSize: '14px' }}>{k.icon}</span>
            </div>
            <div style={{ color: k.color, fontSize: '22px', fontWeight: 700 }}>{k.value.toLocaleString('en-US')}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius: '12px', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <input type="text" placeholder="🔍 Search tournament…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ ...inp, flex: 1, minWidth: '200px' }} />
        {(['Active','All','Cairo','India','Unassigned'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '6px 14px', borderRadius: '99px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
              background: filter===f ? (f==='Cairo'?'#f97316':f==='India'?'#3b82f6':f==='Active'?'#15803d':tk.borderLight) : tk.bgInput,
              color: filter===f ? '#fff' : tk.textMuted }}>
            {f}
          </button>
        ))}
        <span style={{ color: tk.textFaint, fontSize: '12px' }}>
          {loading ? 'Loading…' : `${filtered.length} competitions`}
        </span>
        <button onClick={() => load()} disabled={loading}
          style={{ background: tk.bgInput, border: `1px solid ${tk.border}`, color: tk.textMuted,
            padding: '5px 12px', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '12px', fontWeight: 600, marginLeft: 'auto', opacity: loading ? 0.6 : 1 }}>
          🔄 Refresh
        </button>
      </div>

      {msg && (
        <div style={{ background: msg.type==='ok'?'#052e16':'#450a0a', border:`1px solid ${msg.type==='ok'?'#166534':'#7f1d1d'}`,
          borderRadius:'10px', padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ color: msg.type==='ok'?'#86efac':'#fca5a5', fontSize:'13px' }}>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={{ background:'none', border:'none', color:tk.textDim, cursor:'pointer', fontSize:'18px' }}>×</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: tk.bg, border: `1px solid ${tk.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1100px' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: '36px' }}>#</th>
                <th style={th}>Tournament</th>
                <th style={{ ...th, textAlign: 'center' }}>Players</th>
                <th style={{ ...th, textAlign: 'center' }}>Assigned Team</th>
                <th style={{ ...th, textAlign: 'center' }}>Active</th>
                <th style={th}>Progress</th>
                <th style={th}>By</th>
                <th style={th}>Date</th>
                {(profile.role === 'admin' || profile.team === 'Admin') && <th style={{ ...th, textAlign: 'center' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 11 }).map((_, j) => (
                    <td key={j} style={td}><div style={{ height:'13px', background:tk.tableHead, borderRadius:'4px' }}/></td>
                  ))}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ ...td, textAlign:'center', color:tk.textFaint, padding:'48px' }}>No competitions found</td></tr>
              ) : filtered.map((row, i) => {
                const key     = row.tournament_name ?? '__NULL__'
                const isBusy  = saving === key
                const isAdmin = profile.role === 'admin' || profile.team === 'Admin'
                const isActive = row.is_active !== false
                // total_tasks = players × 4 categories, so divide by 4 for player count
                const totalPlayers = Math.round(row.total_tasks / 4)
                const donePlayers  = Math.round(row.total_done  / 4)
                const pct = totalPlayers > 0 ? Math.round(donePlayers / totalPlayers * 100) : 0

                return (
                  <tr key={key} style={{ opacity: isBusy ? 0.5 : 1,
                    background: isActive ? 'transparent' : 'rgba(0,0,0,0.3)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = isActive ? '#0f1623' : '#0a0a0a')}
                    onMouseLeave={e => (e.currentTarget.style.background = isActive ? 'transparent' : 'rgba(0,0,0,0.3)')}>

                    <td style={{ ...td, color:tk.textFaint, fontFamily:'monospace' }}>{i+1}</td>

                    {/* Name */}
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {!isActive && (
                          <span style={{ background: tk.borderLight, color: tk.textMuted, fontSize: '9px', fontWeight: 700,
                            padding: '1px 5px', borderRadius: '3px', textTransform: 'uppercase' }}>Inactive</span>
                        )}
                        {row.tournament_name
                          ? <span style={{ color: isActive ? tk.text : tk.textDim, fontWeight: 500 }}>{row.tournament_name}</span>
                          : <span style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                              <span style={{ background:tk.borderLight, padding:'1px 5px', borderRadius:'3px', fontSize:'10px', color:tk.textMuted }}>NULL</span>
                              <span style={{ color:tk.textDim, fontStyle:'italic' }}>No Tournament Data</span>
                            </span>}
                      </div>
                    </td>

                    {/* Players */}
                    <td style={{ ...td, textAlign:'center' }}>
                      <span style={{ background:tk.tableHead, color:tk.text, fontWeight:700, padding:'3px 10px', borderRadius:'99px', fontFamily:'monospace' }}>
                        {row.player_count.toLocaleString('en-US')}
                      </span>
                    </td>

                    {/* Assigned team */}
                    <td style={{ ...td, textAlign:'center' }}>
                      {row.assigned_team
                        ? <span style={{ background: TEAM_COLOR[row.assigned_team], color:'#fff', fontWeight:700, fontSize:'12px', padding:'4px 12px', borderRadius:'99px' }}>
                            {row.assigned_team}
                          </span>
                        : <span style={{ color:tk.textFaint, fontSize:'12px', fontStyle:'italic' }}>—</span>}
                    </td>



                    {/* Active toggle */}
                    <td style={{ ...td, textAlign:'center' }}>
                      {isAdmin ? (
                        <button onClick={() => toggleActive(row.tournament_name, row.is_active)} disabled={isBusy}
                          title={isActive ? 'Click to deactivate (hide from Players tab)' : 'Click to activate (show in Players tab)'}
                          style={{ background: isActive ? '#15803d' : tk.borderLight, border: 'none', color: tk.text,
                            fontWeight: 700, fontSize: '11px', padding: '4px 12px', borderRadius: '99px',
                            cursor: 'pointer', opacity: isBusy ? 0.5 : 1 }}>
                          {isActive ? '✓ Active' : '⏸ Off'}
                        </button>
                      ) : (
                        <span style={{ color: isActive ? '#34d399' : tk.textDim, fontSize: '12px', fontWeight: 600 }}>
                          {isActive ? '✓' : '⏸'}
                        </span>
                      )}
                    </td>



                    {/* Progress */}
                    <td style={{ ...td, minWidth: '130px' }}>
                      {row.total_tasks === 0 ? (
                        <span style={{ color:tk.textFaint, fontSize:'11px' }}>
                          {row.assigned_team ? 'Loading…' : '—'}
                        </span>
                      ) : (
                        <div>
                          <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'3px' }}>
                            <div style={{ flex:1, height:'7px', background:tk.tableHead, borderRadius:'99px', overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${pct}%`,
                                background: pct===100?'#16a34a':pct>50?'#f97316':'#2563eb',
                                borderRadius:'99px', transition:'width 0.3s' }} />
                            </div>
                            <span style={{ color:tk.textMuted, fontSize:'11px', minWidth:'34px', textAlign:'right', fontWeight:600 }}>{pct}%</span>
                          </div>
                          <span style={{ color:tk.textFaint, fontSize:'10px' }}>
                            {donePlayers.toLocaleString()} / {totalPlayers.toLocaleString()} players
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Assigned by */}
                    <td style={{ ...td, color:tk.textMuted, fontSize:'11px', whiteSpace:'nowrap' }}>
                      {row.assigned_by_name || <span style={{ color:tk.borderLight }}>—</span>}
                    </td>

                    {/* Date */}
                    <td style={{ ...td, color:tk.textDim, fontSize:'11px', whiteSpace:'nowrap' }}>
                      {row.assigned_at
                        ? new Date(row.assigned_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' })
                        : <span style={{ color:tk.borderLight }}>—</span>}
                    </td>

                    {/* Actions */}
                    {isAdmin && (
                      <td style={{ ...td, textAlign:'center' }}>
                        <div style={{ display:'flex', gap:'4px', justifyContent:'center' }}>
                          <button onClick={() => assignTeam(row.tournament_name, 'Cairo')}
                            disabled={isBusy || row.assigned_team==='Cairo'}
                            style={{ padding:'4px 10px', borderRadius:'6px', border:'none', cursor:'pointer', fontSize:'11px', fontWeight:600,
                              background:row.assigned_team==='Cairo'?'#431407':'#f97316',
                              color:row.assigned_team==='Cairo'?'#fb923c':'#fff', opacity:isBusy?0.5:1 }}>
                            {row.assigned_team==='Cairo'?'✓ Cairo':'Cairo'}
                          </button>
                          <button onClick={() => assignTeam(row.tournament_name, 'India')}
                            disabled={isBusy || row.assigned_team==='India'}
                            style={{ padding:'4px 10px', borderRadius:'6px', border:'none', cursor:'pointer', fontSize:'11px', fontWeight:600,
                              background:row.assigned_team==='India'?'#1e3a5f':'#3b82f6',
                              color:row.assigned_team==='India'?'#60a5fa':'#fff', opacity:isBusy?0.5:1 }}>
                            {row.assigned_team==='India'?'✓ India':'India'}
                          </button>
                          {row.assigned_team && (
                            <button onClick={() => assignTeam(row.tournament_name, null)} disabled={isBusy}
                              style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid #374151',
                                cursor:'pointer', fontSize:'11px', background:'none', color:tk.textDim }}>✕</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding:'10px 16px', borderTop:'1px solid #1f2937', background:tk.bg,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ color:tk.textFaint, fontSize:'12px' }}>
            {filtered.length} competitions · {filtered.reduce((s,r)=>s+r.player_count,0).toLocaleString('en-US')} players
          </span>
          {profile.role !== 'admin' && profile.team !== 'Admin' && (
            <span style={{ color:tk.textFaint, fontSize:'12px', fontStyle:'italic' }}>
              View only — contact admin to change assignments
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
