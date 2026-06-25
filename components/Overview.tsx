'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTheme, T } from '@/components/Dashboard'
import { createClient } from '@/lib/supabase/client'
import { UserProfile, CATEGORIES, TEAM_COLOR } from '@/types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, LineChart, Line
} from 'recharts'

type OverviewTab = 'overall' | 'team' | 'time'
type Range = '15m'|'60m'|'3h'|'6h'|'24h'|'today'|'yesterday'|'3d'|'7d'|'this_week'|'prev_week'|'14d'|'30d'|'this_month'|'prev_month'|'custom'

interface Props { profile: UserProfile }

const STATUS_COLORS: Record<string,string> = {
  'Yes':'#16a34a','Already Updated':'#0d9488','Not Found On Any Source':'#d97706',
  'Player Not Found Online':'#7c3aed','Blocked':'#dc2626','In Progress':'#2563eb','Pending':'#6b7280',
}
const PIE_COLORS = ['#16a34a','#0d9488','#d97706','#7c3aed','#dc2626','#2563eb','#6b7280']
const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value:'15m',        label:'Last 15 Minutes'  },
  { value:'60m',        label:'Last 60 Minutes'  },
  { value:'3h',         label:'Last 3 Hours'     },
  { value:'6h',         label:'Last 6 Hours'     },
  { value:'24h',        label:'Last 24 Hours'    },
  { value:'today',      label:'Today'            },
  { value:'yesterday',  label:'Yesterday'        },
  { value:'3d',         label:'Last 3 Days'      },
  { value:'7d',         label:'Last 7 Days'      },
  { value:'this_week',  label:'This Week'        },
  { value:'prev_week',  label:'Previous Week'    },
  { value:'14d',        label:'Last 14 Days'     },
  { value:'30d',        label:'Last 30 Days'     },
  { value:'this_month', label:'This Month'       },
  { value:'prev_month', label:'Previous Month'   },
  { value:'custom',     label:'Custom Range'     },
]

function fmt(n: number|null|undefined) { return (n||0).toLocaleString('en-US') }

// Returns [fromISO, toISO] for a given range
function getRangeDates(range: Range, customFrom: string, customTo: string, customFromH: string, customToH: string, customFromM: string, customToM: string): [string, string] {
  const now = new Date()
  let from = new Date(), to = new Date()

  if (range === '15m')       { from = new Date(now.getTime() - 15*60*1000) }
  else if (range === '60m')  { from = new Date(now.getTime() - 60*60*1000) }
  else if (range === '3h')   { from = new Date(now.getTime() - 3*60*60*1000) }
  else if (range === '6h')   { from = new Date(now.getTime() - 6*60*60*1000) }
  else if (range === '24h')  { from = new Date(now.getTime() - 24*60*60*1000) }
  else if (range === 'today') {
    from = new Date(now); from.setHours(0,0,0,0)
    to   = new Date(now); to.setHours(23,59,59,999)
  }
  else if (range === 'yesterday') {
    from = new Date(now); from.setDate(from.getDate()-1); from.setHours(0,0,0,0)
    to   = new Date(now); to.setDate(to.getDate()-1);     to.setHours(23,59,59,999)
  }
  else if (range === '3d')         { from = new Date(now.getTime() - 3*24*60*60*1000) }
  else if (range === '7d')         { from = new Date(now.getTime() - 7*24*60*60*1000) }
  else if (range === 'this_week')  {
    from = new Date(now); const day = from.getDay() || 7; from.setDate(from.getDate()-day+1); from.setHours(0,0,0,0)
  }
  else if (range === 'prev_week')  {
    const mon = new Date(now); const d = mon.getDay()||7; mon.setDate(mon.getDate()-d-6); mon.setHours(0,0,0,0)
    from = mon
    to   = new Date(mon); to.setDate(to.getDate()+6); to.setHours(23,59,59,999)
  }
  else if (range === '14d')        { from = new Date(now.getTime() - 14*24*60*60*1000) }
  else if (range === '30d')        { from = new Date(now.getTime() - 30*24*60*60*1000) }
  else if (range === 'this_month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
    to   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59)
  }
  else if (range === 'prev_month') {
    from = new Date(now.getFullYear(), now.getMonth()-1, 1, 0, 0, 0)
    to   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
  }
  else if (range === 'custom') {
    if (customFrom) {
      from = new Date(`${customFrom}T${customFromH}:${customFromM}:00`)
    }
    if (customTo) {
      to = new Date(`${customTo}T${customToH}:${customToM}:59`)
    }
  }

  return [from.toISOString(), to.toISOString()]
}

export default function Overview({ profile }: Props) {
  const supabase = createClient()
  const theme = useTheme()
  const tk    = T[theme]

  const [tab,         setTab]         = useState<OverviewTab>('overall')
  const [range,       setRange]       = useState<Range>('today')
  const [customFrom,  setCustomFrom]  = useState(() => new Date().toISOString().slice(0,10))
  const [customTo,    setCustomTo]    = useState(() => new Date().toISOString().slice(0,10))
  const [customFromH, setCustomFromH] = useState('00')
  const [customFromM, setCustomFromM] = useState('00')
  const [customToH,   setCustomToH]   = useState('23')
  const [customToM,   setCustomToM]   = useState('59')
  const [loading,     setLoading]     = useState(true)
  const [opFilter,    setOpFilter]    = useState('all')

  // All-time data (for Overall tab)
  const [kpis,        setKpis]        = useState({ total:0, done:0, inProgress:0, blocked:0, players:0, alreadyUpdated:0, overallTotal:0 })
  const [catBreak,    setCatBreak]    = useState<any[]>([])
  const [teamBreak,   setTeamBreak]   = useState<any[]>([])
  const [statusBreak,         setStatusBreak]         = useState<any[]>([])
  const [assignedStatusBreak, setAssignedStatusBreak] = useState<any[]>([])

  // Range-filtered data (for Time + Team tabs)
  const [auditRaw,    setAuditRaw]    = useState<any[]>([])
  const [dailyData,   setDailyData]   = useState<any[]>([])
  const [hourData,    setHourData]    = useState<any[]>([])
  const [rangeOps,    setRangeOps]    = useState<any[]>([])  // operator stats within range
  const [allOps,      setAllOps]      = useState<any[]>([])  // all-time leaderboard
  const [summary,     setSummary]     = useState<any[]>([])

  const [fromISO, toISO] = getRangeDates(range, customFrom, customTo, customFromH, customToH, customFromM, customToM)
  const fromDate0 = fromISO.slice(0,10)
  const toDate0   = toISO.slice(0,10)
  const isSubDay  = ['15m','60m','3h','6h','24h'].includes(range)

  const load = useCallback(async () => {
    setLoading(true)
    const [from, to] = getRangeDates(range, customFrom, customTo, customFromH, customToH, customFromM, customToM)
    const from0 = from.slice(0,10), to0 = to.slice(0,10)

    // All queries in parallel — views handle aggregation server-side (no row limits)
    const [
      { data: kpiData },
      { count: totalPlayersCount },
      { data: sumData },
      { data: audit },
      { data: opsAll },
      { data: statusData },
      { data: assignedTours },
      { data: uniqueOps },
    ] = await Promise.all([
      supabase.from('player_kpis').select('*').single(),
      supabase.from('players').select('*',{count:'exact',head:true}),
      supabase.from('team_progress_summary').select('*'),
      supabase.from('task_audit_log').select('*').gte('changed_at', from).lte('changed_at', to).limit(5000),
      supabase.from('operator_leaderboard').select('*'),
      supabase.from('overall_status_breakdown').select('*'),
      supabase.from('tournament_assignments').select('tournament_name,assigned_team').not('assigned_team','is',null),
      supabase.from('operator_leaderboard').select('operator_id,operator_name').not('operator_id','is',null),
    ])

    // ── Assigned player count (players in assigned active tournaments) ─────
    const assignedTourNames0 = (assignedTours||[]).map((t:any)=>t.tournament_name).filter(Boolean)
    let assignedJobCount = 0
    if (assignedTourNames0.length > 0) {
      const { count: apc } = await supabase.from('players')
        .select('*',{count:'exact',head:true})
        .in('player_last_match_tournament_name', assignedTourNames0)
      assignedJobCount = apc || 0
    }

    // ── Status breakdown scoped to assigned tournaments ─────────────────────
    if (assignedTourNames0.length > 0) {
      const { data: assignedPIds } = await supabase
        .from('players').select('player_id')
        .in('player_last_match_tournament_name', assignedTourNames0)
      const assignedIdList = (assignedPIds||[]).map((p:any) => p.player_id)

      if (assignedIdList.length > 0) {
        // Fetch tasks for assigned players only — chunked to avoid URL limits
        const CHUNK = 500
        const statusAgg: Record<string, Record<string, number>> = {}
        for (let i = 0; i < assignedIdList.length; i += CHUNK) {
          const chunk = assignedIdList.slice(i, i + CHUNK)
          const { data: chunkTasks } = await supabase
            .from('player_tasks')
            .select('category, status')
            .in('player_id', chunk)
          ;(chunkTasks || []).forEach((t: any) => {
            if (!statusAgg[t.category]) statusAgg[t.category] = {}
            statusAgg[t.category][t.status] = (statusAgg[t.category][t.status] || 0) + 1
          })
        }
        const assignedRows: any[] = []
        Object.entries(statusAgg).forEach(([cat, statuses]) => {
          Object.entries(statuses).forEach(([status, count]) => {
            assignedRows.push({ category: cat, status, count })
          })
        })
        setAssignedStatusBreak(assignedRows)
      }
    }

    // ── Active operators = unique operators with In Progress tasks right now ──
    const { data: activeOpData } = await supabase
      .from('player_tasks')
      .select('operator_id, operator_name')
      .eq('status', 'In Progress')
      .not('operator_id', 'is', null)
    const activeOpCount = new Set((activeOpData||[]).map((t:any)=>t.operator_id)).size

    // ── KPI cards — from player_kpis view (1 player = 1 job) ─────────────
    const kpi = (kpiData || {}) as any
    setKpis({
      total:         assignedJobCount,           // Assigned Jobs
      done:          kpi.completed_players  || 0,
      inProgress:    kpi.inprogress_players || 0,
      blocked:       kpi.blocked_players    || 0,
      players:       totalPlayersCount      || 0,
      alreadyUpdated: activeOpCount,             // Active Operators (claimed right now)
      overallTotal:  kpi.total_players      || 0, // for Overall Completion bar
    })

    setSummary(sumData||[])
    setAllOps(opsAll||[])
    setStatusBreak(statusData||[])  // {category, status, count} — for pie, breakdown cards, table
    setAuditRaw(audit||[])

    // ── Bar chart: Pending scoped to assigned tournaments ─────────────────
    const assignedTourNames = (assignedTours||[]).map((t:any)=>t.tournament_name).filter(Boolean)

    let assignedPlayerCount = 0
    if (assignedTourNames.length > 0) {
      const { count: apc } = await supabase.from('players')
        .select('*',{count:'exact',head:true})
        .in('player_last_match_tournament_name', assignedTourNames)
      assignedPlayerCount = apc || 0
    }

    // Build bar chart from overall_status_breakdown
    const cats = ['Date of Birth','Height & Weight','Hometown Update','Profile Pic Update']
    setCatBreak(cats.map(cat => {
      const catRows = (statusData||[]).filter((r:any) => r.category === cat)
      const done   = catRows.filter((r:any) => !['Pending','In Progress'].includes(r.status))
                            .reduce((s:number,r:any) => s+(r.count||0), 0)
      const inProg = catRows.find((r:any) => r.status === 'In Progress')?.count || 0
      const pending = assignedPlayerCount > 0
        ? Math.max(0, assignedPlayerCount - done - inProg)
        : catRows.find((r:any) => r.status === 'Pending')?.count || 0
      return {
        name: cat.replace(' Update','').replace('Height & Weight','Ht/Wt'),
        Done: done, 'In Progress': inProg, Pending: pending,
      }
    }))

    // Team breakdown (all-time)
    const teamMap: Record<string,{done:number;total:number}> = {}
    ;(sumData||[]).forEach((r:any) => {
      if (!r.team) return
      if (!teamMap[r.team]) teamMap[r.team]={done:0,total:0}
      teamMap[r.team].done  += r.completed||0
      teamMap[r.team].total += r.total||0
    })
    setTeamBreak(Object.entries(teamMap).map(([team,v])=>({
      team, Done:v.done, Pending:v.total-v.done,
      pct: v.total>0?Math.round(v.done/v.total*100):0
    })))

    // Build operator stats from audit data within range
    // Include status breakdown (Yes, Already Updated, Not Found, etc.)
    type OpEntry = {
      name:string; team:string; total:number
      // Player task counts
      playerUpdated:Set<number>; playerAlreadyUpdated:Set<number>
      playerNotFound:Set<number>; playerNotOnline:Set<number>
      playerBlocked:Set<number>; playerInProgress:Set<number>
      players:Set<number>
      // Pic task counts
      picUpdated:Set<number>; picAlreadyUpdated:Set<number>
      picNotFound:Set<number>; picNotOnline:Set<number>
      picBlocked:Set<number>; picInProgress:Set<number>
      pics:Set<number>
    }
    const opMap: Record<string, OpEntry> = {}
    ;(audit||[]).forEach((r:any) => {
      const k = r.changed_by || r.changed_by_name
      if (!k) return
      if (!opMap[k]) opMap[k] = {
        name:r.changed_by_name||'Unknown', team:r.changed_by_team||'', total:0,
        playerUpdated:new Set(), playerAlreadyUpdated:new Set(),
        playerNotFound:new Set(), playerNotOnline:new Set(),
        playerBlocked:new Set(), playerInProgress:new Set(), players:new Set(),
        picUpdated:new Set(), picAlreadyUpdated:new Set(),
        picNotFound:new Set(), picNotOnline:new Set(),
        picBlocked:new Set(), picInProgress:new Set(), pics:new Set(),
      }
      opMap[k].total++
      const pid = r.player_id
      const ns  = r.new_status
      if (r.category === 'Profile Pic Update') {
        opMap[k].pics.add(pid)
        if (ns === 'Yes')                      opMap[k].picUpdated.add(pid)
        else if (ns === 'Already Updated')     opMap[k].picAlreadyUpdated.add(pid)
        else if (ns === 'Not Found On Any Source') opMap[k].picNotFound.add(pid)
        else if (ns === 'Player Not Found Online') opMap[k].picNotOnline.add(pid)
        else if (ns === 'Blocked')             opMap[k].picBlocked.add(pid)
        else if (ns === 'In Progress')         opMap[k].picInProgress.add(pid)
      } else {
        opMap[k].players.add(pid)
        if (ns === 'Yes')                      opMap[k].playerUpdated.add(pid)
        else if (ns === 'Already Updated')     opMap[k].playerAlreadyUpdated.add(pid)
        else if (ns === 'Not Found On Any Source') opMap[k].playerNotFound.add(pid)
        else if (ns === 'Player Not Found Online') opMap[k].playerNotOnline.add(pid)
        else if (ns === 'Blocked')             opMap[k].playerBlocked.add(pid)
        else if (ns === 'In Progress')         opMap[k].playerInProgress.add(pid)
      }
    })
    const opsInRange = Object.values(opMap).map(op => ({
      name:                op.name,
      team:                op.team,
      total:               op.total,
      // Player stats
      players:             op.players.size,
      playerUpdated:       op.playerUpdated.size,
      playerAlreadyUpdated:op.playerAlreadyUpdated.size,
      playerNotFound:      op.playerNotFound.size,
      playerNotOnline:     op.playerNotOnline.size,
      playerBlocked:       op.playerBlocked.size,
      playerInProgress:    op.playerInProgress.size,
      // Pic stats
      pics:                op.pics.size,
      picUpdated:          op.picUpdated.size,
      picAlreadyUpdated:   op.picAlreadyUpdated.size,
      picNotFound:         op.picNotFound.size,
      picNotOnline:        op.picNotOnline.size,
      picBlocked:          op.picBlocked.size,
      picInProgress:       op.picInProgress.size,
    })).sort((a,b)=>b.total-a.total)
    setRangeOps(opsInRange)

    // Daily trend
    const dayMap: Record<string,number> = {}
    ;(audit||[]).forEach((r:any) => {
      const d = r.changed_at?.slice(0,10)
      if (d) dayMap[d] = (dayMap[d]||0) + 1
    })
    const days: any[] = []
    const cur = new Date(from0); cur.setHours(0,0,0,0)
    const end = new Date(to0);   end.setHours(0,0,0,0)
    while (cur <= end) {
      const k = cur.toISOString().slice(0,10)
      days.push({ date: k.slice(5), updates: dayMap[k]||0 })
      cur.setDate(cur.getDate()+1)
    }
    setDailyData(days)

    // Hour of day
    const hMap: Record<number,number> = {}
    for(let h=0;h<24;h++) hMap[h]=0
    ;(audit||[]).forEach((r:any) => {
      const d = r.changed_at?.slice(0,10)
      if (!d || d < from0 || d > to0) return
      const h = new Date(r.changed_at).getHours()
      hMap[h] = (hMap[h]||0)+1
    })
    setHourData(Object.entries(hMap).map(([h,v])=>({ hour:`${String(h).padStart(2,'0')}:00`, updates:v as number })))

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo, customFromH, customFromM, customToH, customToM])

  useEffect(() => { load() }, [load])

  // Completion % = Assigned Jobs progress (Completed / Assigned)
  const pct    = kpis.total > 0 ? (kpis.done/kpis.total*100) : 0
  const pctStr = kpis.total > 0 ? pct.toFixed(1) + '%' : '0%'

  // Overall Completion = all players with tasks (from player_kpis view, excludes inactive)
  // kpis.players = total players in DB; use player_kpis total_players for overall
  const overallTotal = kpis.overallTotal || 0
  const overallPct   = overallTotal > 0 ? (kpis.done/overallTotal*100) : 0
  const overallPctStr = overallTotal > 0 ? overallPct.toFixed(1) + '%' : '0%'

  const inp: React.CSSProperties = {
    background: tk.bgInput, border:`1px solid ${tk.border}`, borderRadius:'8px',
    padding:'6px 11px', color: tk.text, fontSize:'12px', outline:'none',
  }
  const card = (children: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'12px', padding:'20px', ...style }}>
      {children}
    </div>
  )
  const h3 = (text: string, sub?: string) => (
    <div style={{ marginBottom:'14px' }}>
      <h3 style={{ color:tk.text, fontWeight:600, margin:0, fontSize:'14px' }}>{text}</h3>
      {sub && <p style={{ color:tk.textMuted, fontSize:'11px', margin:'3px 0 0' }}>{sub}</p>}
    </div>
  )
  const tH: React.CSSProperties = {
    padding:'8px 12px', color:tk.textDim, fontSize:'10px', fontWeight:600,
    textTransform:'uppercase', textAlign:'left', borderBottom:`1px solid ${tk.border}`,
    whiteSpace:'nowrap', background:tk.tableHead,
  }
  const tD: React.CSSProperties = {
    padding:'9px 12px', borderBottom:`1px solid ${tk.tableRow}`, fontSize:'12px', color:tk.textMuted,
  }

  const opList = Array.from(new Set(auditRaw.map((r:any)=>r.changed_by_name).filter(Boolean)))
  const filteredRangeOps = opFilter === 'all' ? rangeOps : rangeOps.filter(op => op.name === opFilter)
  const filteredAudit    = opFilter === 'all' ? auditRaw : auditRaw.filter((r:any) => r.changed_by_name === opFilter)

  // Use assigned-scoped data for pie + breakdown cards; fall back to overall if not loaded
  const scopedBreak = assignedStatusBreak.length > 0 ? assignedStatusBreak : statusBreak
  const picBreak    = scopedBreak.filter((r:any)=>r.category==='Profile Pic Update')
  const coreBreak   = scopedBreak.filter((r:any)=>r.category!=='Profile Pic Update')
  const pieData     = Object.entries(
    scopedBreak.reduce((acc:any,r:any)=>{ acc[r.status]=(acc[r.status]||0)+(r.count||0); return acc }, {})
  ).map(([name,value])=>({ name, value })).sort((a:any,b:any)=>b.value-a.value)

  const rangeLabel = RANGE_OPTIONS.find(o=>o.value===range)?.label || range
  const totalInRange = auditRaw.length
  const uniqOpsInRange = new Set(auditRaw.map((r:any)=>r.changed_by_name).filter(Boolean)).size

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

      {/* Sub-tabs + range selector */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'10px' }}>
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {([['overall','📊 Overall'],['team','👥 Team / Analyst'],['time','⏱ Time Analysis']] as const).map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)}
              style={{ padding:'8px 16px', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight:600,
                background:tab===k?'#f97316':tk.bgInput, color:tab===k?'#fff':tk.textMuted }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
          {/* Range dropdown */}
          <select value={range} onChange={e=>setRange(e.target.value as Range)} style={{ ...inp, minWidth:'150px' }}>
            {RANGE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {range === 'custom' && (
            <div style={{ display:'flex', gap:'4px', alignItems:'center', flexWrap:'wrap' }}>
              <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{ ...inp, width:'130px' }} />
              <select value={customFromH} onChange={e=>setCustomFromH(e.target.value)} style={{ ...inp, width:'70px' }}>
                {Array.from({length:24},(_,i)=><option key={i} value={String(i).padStart(2,'0')}>{String(i).padStart(2,'0')}</option>)}
              </select>
              <span style={{ color:tk.textDim, fontSize:'12px' }}>:</span>
              <select value={customFromM} onChange={e=>setCustomFromM(e.target.value)} style={{ ...inp, width:'70px' }}>
                {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m=><option key={m} value={m}>{m}</option>)}
              </select>
              <span style={{ color:tk.textDim }}>→</span>
              <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{ ...inp, width:'130px' }} />
              <select value={customToH} onChange={e=>setCustomToH(e.target.value)} style={{ ...inp, width:'70px' }}>
                {Array.from({length:24},(_,i)=><option key={i} value={String(i).padStart(2,'0')}>{String(i).padStart(2,'0')}</option>)}
              </select>
              <span style={{ color:tk.textDim, fontSize:'12px' }}>:</span>
              <select value={customToM} onChange={e=>setCustomToM(e.target.value)} style={{ ...inp, width:'70px' }}>
                {['00','05','10','15','20','25','30','35','40','45','50','55','59'].map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          <button onClick={load}
            style={{ background:'#f97316', border:'none', color:'#fff', padding:'6px 14px',
              borderRadius:'8px', cursor:'pointer', fontSize:'12px', fontWeight:600 }}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Range summary banner */}
      <div style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'10px', padding:'10px 16px',
        display:'flex', gap:'24px', flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ color:tk.textMuted, fontSize:'12px' }}>📅 <strong style={{color:tk.text}}>{rangeLabel}</strong></span>
        <span style={{ color:tk.textMuted, fontSize:'12px' }}>⏱ {fromISO.slice(0,16).replace('T',' ')} → {toISO.slice(0,16).replace('T',' ')} IST</span>
        <span style={{ color:'#f97316', fontSize:'12px', fontWeight:600 }}>{fmt(totalInRange)} actions in range</span>
        <span style={{ color:tk.textDim, fontSize:'12px' }}>{uniqOpsInRange} operators active</span>
      </div>

      {loading && <div style={{ textAlign:'center', padding:'40px', color:tk.textDim }}>Loading analytics…</div>}

      {/* ── OVERALL TAB ── */}
      {!loading && tab==='overall' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))', gap:'10px' }}>
            {[
              { label:'Total Players',    value:fmt(kpis.players),       icon:'👤', color:'#f97316' },
              { label:'Assigned Jobs',    value:fmt(kpis.total),         icon:'📋', color:tk.text   },
              { label:'Completed Jobs',   value:fmt(kpis.done),          icon:'✅', color:'#16a34a' },
              { label:'Active Operators', value:fmt(kpis.alreadyUpdated),icon:'👥', color:'#0d9488' },
              { label:'In Progress',      value:fmt(kpis.inProgress),    icon:'🔄', color:'#2563eb' },
              { label:'Blocked',          value:fmt(kpis.blocked),       icon:'🚫', color:'#dc2626' },
              { label:'Completion %',     value:pctStr,                  icon:'📈', color:'#f97316' },
            ].map(k=>(
              <div key={k.label} style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'12px', padding:'14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span style={{ color:tk.textDim, fontSize:'9px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>{k.label}</span>
                  <span style={{ fontSize:'14px' }}>{k.icon}</span>
                </div>
                <div style={{ color:k.color, fontSize:'20px', fontWeight:700 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {card(<>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
              <span style={{ color:tk.text, fontWeight:600, fontSize:'13px' }}>Overall Completion</span>
              <span style={{ color:'#f97316', fontWeight:700, fontSize:'18px' }}>{overallPctStr}</span>
            </div>
            <p style={{ color:tk.textFaint, fontSize:'11px', margin:'0 0 8px' }}>
              All active tournament players regardless of team assignment
            </p>
            <div style={{ height:'10px', background:tk.bgInput, borderRadius:'99px', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${overallPct.toFixed(1)}%`, background:'linear-gradient(90deg,#16a34a,#22c55e)', borderRadius:'99px', transition:'width 0.5s' }}/>
            </div>
            <p style={{ color:tk.textDim, fontSize:'12px', margin:'6px 0 0' }}>
              {fmt(kpis.done)} of {fmt(overallTotal)} players completed · {fmt(overallTotal - kpis.done)} remaining
            </p>
          </>)}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))', gap:'16px' }}>
            {card(<>
              {h3('Tasks by Category')}
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={catBreak}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tk.border}/>
                  <XAxis dataKey="name" tick={{fill:tk.textMuted,fontSize:11}}/>
                  <YAxis tick={{fill:tk.textMuted,fontSize:11}}/>
                  <Tooltip contentStyle={{background:'#111827',border:'1px solid #374151',borderRadius:'8px',color:'#f9fafb',fontSize:'12px'}}/>
                  <Legend wrapperStyle={{fontSize:12,color:tk.textMuted}}/>
                  <Bar dataKey="Done"        fill="#16a34a" radius={[4,4,0,0]}/>
                  <Bar dataKey="In Progress" fill="#2563eb" radius={[4,4,0,0]}/>
                  <Bar dataKey="Pending"     fill="#4b5563" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </>)}
            {card(<>
              {h3('Status Distribution')}
              <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                <ResponsiveContainer width="50%" height={190}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={75} innerRadius={35}>
                      {pieData.map((_:any,i:number)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                    </Pie>
                    <Tooltip contentStyle={{background:'#111827',border:'1px solid #374151',borderRadius:'8px',color:'#f9fafb',fontSize:'12px'}}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'4px' }}>
                  {pieData.map((d:any,i:number)=>(
                    <div key={d.name} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                      <div style={{ width:'8px', height:'8px', borderRadius:'2px', background:PIE_COLORS[i%PIE_COLORS.length], flexShrink:0 }}/>
                      <span style={{ color:tk.textMuted, fontSize:'10px', flex:1 }}>{d.name}</span>
                      <span style={{ color:tk.text, fontSize:'11px', fontWeight:600 }}>{fmt(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>)}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
            {card(<>
              {h3('👤 Player Task Breakdown', 'DOB + Ht/Wt + Hometown')}
              <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
                {['Yes','Already Updated','Not Found On Any Source','Player Not Found Online','Blocked','In Progress','Pending'].map(status=>{
                  const count = coreBreak.filter((r:any)=>r.status===status).reduce((s:number,r:any)=>s+(r.count||0),0)
                  const total = coreBreak.reduce((s:number,r:any)=>s+(r.count||0),0)
                  const p2    = total>0?Math.round(count/total*100):0
                  if(!count) return null
                  return (
                    <div key={status}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'2px' }}>
                        <span style={{ fontSize:'11px', color:tk.textMuted }}>{status}</span>
                        <span style={{ fontSize:'11px', fontWeight:600, color:STATUS_COLORS[status]||tk.text }}>{fmt(count)} ({p2}%)</span>
                      </div>
                      <div style={{ height:'5px', background:tk.bgInput, borderRadius:'99px', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${p2}%`, background:STATUS_COLORS[status]||'#6b7280', borderRadius:'99px' }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>)}
            {card(<>
              {h3('📸 Profile Pic Breakdown')}
              <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
                {['Yes','Already Updated','Not Found On Any Source','Player Not Found Online','Blocked','In Progress','Pending'].map(status=>{
                  const count = picBreak.filter((r:any)=>r.status===status).reduce((s:number,r:any)=>s+(r.count||0),0)
                  const total = picBreak.reduce((s:number,r:any)=>s+(r.count||0),0)
                  const p2    = total>0?Math.round(count/total*100):0
                  if(!count) return null
                  return (
                    <div key={status}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'2px' }}>
                        <span style={{ fontSize:'11px', color:tk.textMuted }}>{status}</span>
                        <span style={{ fontSize:'11px', fontWeight:600, color:STATUS_COLORS[status]||tk.text }}>{fmt(count)} ({p2}%)</span>
                      </div>
                      <div style={{ height:'5px', background:tk.bgInput, borderRadius:'99px', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${p2}%`, background:STATUS_COLORS[status]||'#6b7280', borderRadius:'99px' }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>)}
          </div>

          {card(<>
            {h3('Category × Status Table')}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>
                  {['Category','✅ Yes','✔ Already Upd','❌ Not Found','🔍 Not Online','🚫 Blocked','🔄 In Progress','⏳ Pending','Total'].map(h=>(
                    <th key={h} style={tH}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {CATEGORIES.map(cat=>{
                    const rows = scopedBreak.filter((r:any)=>r.category===cat)
                    const get  = (s:string)=>rows.find((r:any)=>r.status===s)?.count||0
                    const tot  = rows.reduce((s:number,r:any)=>s+(r.count||0),0)
                    return (
                      <tr key={cat}>
                        <td style={{ ...tD, color:tk.text, fontWeight:600 }}>{cat}</td>
                        <td style={tD}><span style={{ color:'#16a34a', fontWeight:700 }}>{fmt(get('Yes'))}</span></td>
                        <td style={tD}><span style={{ color:'#0d9488' }}>{fmt(get('Already Updated'))}</span></td>
                        <td style={tD}><span style={{ color:'#d97706' }}>{fmt(get('Not Found On Any Source'))}</span></td>
                        <td style={tD}><span style={{ color:'#7c3aed' }}>{fmt(get('Player Not Found Online'))}</span></td>
                        <td style={tD}><span style={{ color:'#dc2626' }}>{fmt(get('Blocked'))}</span></td>
                        <td style={tD}><span style={{ color:'#2563eb' }}>{fmt(get('In Progress'))}</span></td>
                        <td style={tD}><span style={{ color:tk.textFaint }}>{fmt(get('Pending'))}</span></td>
                        <td style={{ ...tD, color:tk.textDim, fontWeight:600 }}>{fmt(tot)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>)}
        </div>
      )}

      {/* ── TEAM / ANALYST TAB ── */}
      {!loading && tab==='team' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* Range KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'10px' }}>
            {[
              { label:'Actions in Range',   value:fmt(totalInRange),                                                                     icon:'⚡', color:'#f97316' },
              { label:'Active Operators',   value:fmt(uniqOpsInRange),                                                                   icon:'👥', color:'#60a5fa' },
              { label:'Player Tasks',       value:fmt(filteredRangeOps.reduce((s,o)=>s+o.player,0)),                                     icon:'👤', color:'#34d399' },
              { label:'Pic Tasks',          value:fmt(filteredRangeOps.reduce((s,o)=>s+o.pic,0)),                                        icon:'📸', color:'#a78bfa' },
              { label:'Unique Players',     value:fmt(filteredRangeOps.reduce((s,o)=>s+o.unique_players,0)),                             icon:'🎯', color:'#fb923c' },
            ].map(k=>(
              <div key={k.label} style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'12px', padding:'14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span style={{ color:tk.textDim, fontSize:'9px', fontWeight:600, textTransform:'uppercase' }}>{k.label}</span>
                  <span style={{ fontSize:'14px' }}>{k.icon}</span>
                </div>
                <div style={{ color:k.color, fontSize:'20px', fontWeight:700 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Operator filter */}
          <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
            <label style={{ color:tk.textMuted, fontSize:'12px', fontWeight:600 }}>Filter by Operator:</label>
            <select value={opFilter} onChange={e=>setOpFilter(e.target.value)} style={{ ...inp, minWidth:'180px' }}>
              <option value="all">All Operators ({opList.length})</option>
              {opList.map((op:any)=><option key={op} value={op}>{op}</option>)}
            </select>
            {opFilter!=='all' && (
              <button onClick={()=>setOpFilter('all')}
                style={{ background:'none', border:`1px solid ${tk.border}`, color:tk.textDim,
                  padding:'5px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'12px' }}>
                ✕ Clear
              </button>
            )}
          </div>

          {/* Player Tasks table */}
          {card(<>
            {h3('👤 Player Tasks in Period', `Status breakdown per operator during "${rangeLabel}"`)}
            {filteredRangeOps.filter((op:any)=>op.players>0).length === 0 ? (
              <p style={{ color:tk.textFaint, textAlign:'center', padding:'32px 0' }}>
                No player task activity in this period.
              </p>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>
                    {['#','Operator','Team','Players Updated (Count)','Yes (Updated)','Already Updated','Not Found On Any Source','Player Not Found Online','Blocked','In Progress'].map(h=>(
                      <th key={h} style={tH}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredRangeOps.filter((op:any)=>op.players>0).map((op:any,i:number)=>(
                      <tr key={op.name}
                        onMouseEnter={e=>(e.currentTarget.style.background=tk.rowHover)}
                        onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                        <td style={{ ...tD, color:tk.textFaint, fontSize:'13px' }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                        <td style={{ ...tD, color:tk.text, fontWeight:600, whiteSpace:'nowrap' }}>{op.name}</td>
                        <td style={tD}><span style={{ color:TEAM_COLOR[op.team as 'Cairo'|'India'|'Admin']||tk.textMuted, fontSize:'12px', fontWeight:600 }}>{op.team||'—'}</span></td>
                        <td style={{ ...tD, color:'#f97316', fontWeight:700 }}>{fmt(op.players)}</td>
                        <td style={{ ...tD, color:'#16a34a', fontWeight:600 }}>{fmt(op.playerUpdated)}</td>
                        <td style={{ ...tD, color:'#0d9488' }}>{fmt(op.playerAlreadyUpdated)}</td>
                        <td style={{ ...tD, color:'#d97706' }}>{fmt(op.playerNotFound)}</td>
                        <td style={{ ...tD, color:'#7c3aed' }}>{fmt(op.playerNotOnline)}</td>
                        <td style={{ ...tD, color:'#dc2626' }}>{fmt(op.playerBlocked)}</td>
                        <td style={{ ...tD, color:'#2563eb' }}>{fmt(op.playerInProgress)}</td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr style={{ background: tk.tableHead, fontWeight:700 }}>
                      <td style={tD} colSpan={3}><span style={{ color:tk.text }}>Total</span></td>
                      <td style={{ ...tD, color:'#f97316', fontWeight:700 }}>{fmt(filteredRangeOps.filter((o:any)=>o.players>0).reduce((s:number,o:any)=>s+o.players,0))}</td>
                      <td style={{ ...tD, color:'#16a34a' }}>{fmt(filteredRangeOps.reduce((s:number,o:any)=>s+o.playerUpdated,0))}</td>
                      <td style={{ ...tD, color:'#0d9488' }}>{fmt(filteredRangeOps.reduce((s:number,o:any)=>s+o.playerAlreadyUpdated,0))}</td>
                      <td style={{ ...tD, color:'#d97706' }}>{fmt(filteredRangeOps.reduce((s:number,o:any)=>s+o.playerNotFound,0))}</td>
                      <td style={{ ...tD, color:'#7c3aed' }}>{fmt(filteredRangeOps.reduce((s:number,o:any)=>s+o.playerNotOnline,0))}</td>
                      <td style={{ ...tD, color:'#dc2626' }}>{fmt(filteredRangeOps.reduce((s:number,o:any)=>s+o.playerBlocked,0))}</td>
                      <td style={{ ...tD, color:'#2563eb' }}>{fmt(filteredRangeOps.reduce((s:number,o:any)=>s+o.playerInProgress,0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>)}

          {/* Profile Pic Tasks table */}
          {card(<>
            {h3('📸 Profile Pic Tasks in Period', `Status breakdown per operator during "${rangeLabel}"`)}
            {filteredRangeOps.filter((op:any)=>op.pics>0).length === 0 ? (
              <p style={{ color:tk.textFaint, textAlign:'center', padding:'32px 0' }}>
                No profile pic activity in this period.
              </p>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>
                    {['#','Operator','Team','Players Updated (Count)','Yes (Uploaded)','Already Updated','Not Found On Any Source','Player Not Found Online','Blocked','In Progress'].map(h=>(
                      <th key={h} style={tH}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredRangeOps.filter((op:any)=>op.pics>0).map((op:any,i:number)=>(
                      <tr key={op.name}
                        onMouseEnter={e=>(e.currentTarget.style.background=tk.rowHover)}
                        onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                        <td style={{ ...tD, color:tk.textFaint, fontSize:'13px' }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                        <td style={{ ...tD, color:tk.text, fontWeight:600, whiteSpace:'nowrap' }}>{op.name}</td>
                        <td style={tD}><span style={{ color:TEAM_COLOR[op.team as 'Cairo'|'India'|'Admin']||tk.textMuted, fontSize:'12px', fontWeight:600 }}>{op.team||'—'}</span></td>
                        <td style={{ ...tD, color:'#a78bfa', fontWeight:700 }}>{fmt(op.pics)}</td>
                        <td style={{ ...tD, color:'#16a34a', fontWeight:600 }}>{fmt(op.picUpdated)}</td>
                        <td style={{ ...tD, color:'#0d9488' }}>{fmt(op.picAlreadyUpdated)}</td>
                        <td style={{ ...tD, color:'#d97706' }}>{fmt(op.picNotFound)}</td>
                        <td style={{ ...tD, color:'#7c3aed' }}>{fmt(op.picNotOnline)}</td>
                        <td style={{ ...tD, color:'#dc2626' }}>{fmt(op.picBlocked)}</td>
                        <td style={{ ...tD, color:'#2563eb' }}>{fmt(op.picInProgress)}</td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr style={{ background: tk.tableHead, fontWeight:700 }}>
                      <td style={tD} colSpan={3}><span style={{ color:tk.text }}>Total</span></td>
                      <td style={{ ...tD, color:'#a78bfa', fontWeight:700 }}>{fmt(filteredRangeOps.filter((o:any)=>o.pics>0).reduce((s:number,o:any)=>s+o.pics,0))}</td>
                      <td style={{ ...tD, color:'#16a34a' }}>{fmt(filteredRangeOps.reduce((s:number,o:any)=>s+o.picUpdated,0))}</td>
                      <td style={{ ...tD, color:'#0d9488' }}>{fmt(filteredRangeOps.reduce((s:number,o:any)=>s+o.picAlreadyUpdated,0))}</td>
                      <td style={{ ...tD, color:'#d97706' }}>{fmt(filteredRangeOps.reduce((s:number,o:any)=>s+o.picNotFound,0))}</td>
                      <td style={{ ...tD, color:'#7c3aed' }}>{fmt(filteredRangeOps.reduce((s:number,o:any)=>s+o.picNotOnline,0))}</td>
                      <td style={{ ...tD, color:'#dc2626' }}>{fmt(filteredRangeOps.reduce((s:number,o:any)=>s+o.picBlocked,0))}</td>
                      <td style={{ ...tD, color:'#2563eb' }}>{fmt(filteredRangeOps.reduce((s:number,o:any)=>s+o.picInProgress,0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>)}

          {/* All-time leaderboard */}
          {card(<>
            {h3('All-Time Player Leaderboard', '"Fully Completed" = 1 player where all 3 tasks (DOB + Ht/Wt + Hometown) resolved. Each player = 1 job.')}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>
                  {['#','Operator','Team','Players Touched','Fully Completed','Pic Tasks','Active Days','Last Active'].map(h=>(
                    <th key={h} style={tH}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(opFilter==='all' ? allOps : allOps.filter((op:any)=>op.operator_name===opFilter))
                    .length===0 ? (
                    <tr><td colSpan={8} style={{ ...tD, textAlign:'center', color:tk.textFaint, padding:'32px' }}>No data</td></tr>
                  ) : (opFilter==='all' ? allOps : allOps.filter((op:any)=>op.operator_name===opFilter)).map((op:any,i:number)=>(
                    <tr key={op.operator_id||i}
                      onMouseEnter={e=>(e.currentTarget.style.background=tk.rowHover)}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                      <td style={{ ...tD, color:tk.textFaint }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                      <td style={{ ...tD, color:tk.text, fontWeight:600, whiteSpace:'nowrap' }}>{op.operator_name||'—'}</td>
                      <td style={tD}>
                        <span style={{ color:TEAM_COLOR[op.team as 'Cairo'|'India'|'Admin']||tk.textMuted, fontSize:'12px', fontWeight:600 }}>{op.team||'—'}</span>
                      </td>
                      <td style={{ ...tD, color:'#f97316', fontWeight:700 }}>{fmt(op.total_updates)}</td>
                      <td style={{ ...tD, color:'#34d399', fontWeight:600 }}>{fmt(op.completed_count)}</td>
                      <td style={{ ...tD, color:'#a78bfa' }}>{fmt(op.pic_count)}</td>
                      <td style={tD}>{op.active_days||0}</td>
                      <td style={{ ...tD, whiteSpace:'nowrap', fontSize:'11px' }}>
                        {op.last_activity?new Date(op.last_activity).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}):'—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {/* Team bars */}
          {card(<>
            {h3('Completed per Team × Category (All-Time)')}
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={CATEGORIES.map(cat=>{
                const row:any={ name:cat.replace(' Update','').replace('Height & Weight','Ht/Wt') }
                ;['Cairo','India'].forEach(team=>{
                  const s=summary.find((r:any)=>r.team===team&&r.category===cat)
                  row[team]=s?.completed||0
                })
                return row
              })}>
                <CartesianGrid strokeDasharray="3 3" stroke={tk.border}/>
                <XAxis dataKey="name" tick={{fill:tk.textMuted,fontSize:11}}/>
                <YAxis tick={{fill:tk.textMuted,fontSize:11}}/>
                <Tooltip contentStyle={{background:'#111827',border:'1px solid #374151',borderRadius:'8px',color:'#f9fafb',fontSize:'12px'}}/>
                <Legend wrapperStyle={{fontSize:12}}/>
                <Bar dataKey="Cairo" fill="#f97316" radius={[4,4,0,0]}/>
                <Bar dataKey="India" fill="#3b82f6" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </>)}
        </div>
      )}

      {/* ── TIME ANALYSIS TAB ── */}
      {!loading && tab==='time' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(165px,1fr))', gap:'10px' }}>
            {[
              { label:'Actions in Range',  value:fmt(totalInRange),                                                                                                                                  icon:'⚡' },
              { label:'Most Active Hour',  value:hourData.reduce((a:any,b:any)=>b.updates>a.updates?b:a,{hour:'—',updates:0}).hour,                                                                  icon:'⏰' },
              { label:'Peak Day Updates', value:fmt(Math.max(...dailyData.map((d:any)=>d.updates),0)),                                                                                               icon:'🔥' },
              { label:'Avg Daily',         value:dailyData.filter((d:any)=>d.updates>0).length>0?fmt(Math.round(dailyData.reduce((s:number,d:any)=>s+d.updates,0)/dailyData.filter((d:any)=>d.updates>0).length)):'0', icon:'📊' },
              { label:'Active Operators',  value:fmt(uniqOpsInRange),                                                                                                                                icon:'👥' },
            ].map(k=>(
              <div key={k.label} style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'12px', padding:'14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span style={{ color:tk.textDim, fontSize:'9px', fontWeight:600, textTransform:'uppercase' }}>{k.label}</span>
                  <span style={{ fontSize:'14px' }}>{k.icon}</span>
                </div>
                <div style={{ color:'#f97316', fontSize:'20px', fontWeight:700 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {!isSubDay && card(<>
            {h3(`Daily Activity — ${rangeLabel}`)}
            {dailyData.every((d:any)=>d.updates===0) ? (
              <p style={{ color:tk.textFaint, textAlign:'center', padding:'32px 0' }}>No activity in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={tk.border}/>
                  <XAxis dataKey="date" tick={{fill:tk.textMuted,fontSize:10}} interval="preserveStartEnd"/>
                  <YAxis tick={{fill:tk.textMuted,fontSize:11}}/>
                  <Tooltip contentStyle={{background:'#111827',border:'1px solid #374151',borderRadius:'8px',color:'#f9fafb',fontSize:'12px'}}/>
                  <Area type="monotone" dataKey="updates" stroke="#f97316" strokeWidth={2} fill="url(#ag)" name="Updates"/>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </>)}

          {card(<>
            {h3('Activity by Hour of Day (IST)')}
            {hourData.every((d:any)=>d.updates===0) ? (
              <p style={{ color:tk.textFaint, textAlign:'center', padding:'32px 0' }}>No activity in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tk.border}/>
                  <XAxis dataKey="hour" tick={{fill:tk.textMuted,fontSize:10}} interval={1}/>
                  <YAxis tick={{fill:tk.textMuted,fontSize:11}}/>
                  <Tooltip contentStyle={{background:'#111827',border:'1px solid #374151',borderRadius:'8px',color:'#f9fafb',fontSize:'12px'}}
                    formatter={(v:any)=>[v,'Updates']} labelFormatter={l=>`Hour: ${l}`}/>
                  <Bar dataKey="updates" radius={[4,4,0,0]}>
                    {hourData.map((entry:any,i:number)=>{
                      const maxV=Math.max(...hourData.map((d:any)=>d.updates))
                      return <Cell key={i} fill={entry.updates===maxV&&maxV>0?'#f97316':'#2563eb'}/>
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <p style={{ color:tk.textDim, fontSize:'11px', margin:'8px 0 0' }}>🟠 Peak · 🔵 Other · IST (UTC+5:30)</p>
          </>)}

          {/* Per-operator line chart when filtered */}
          {opFilter!=='all' && filteredAudit.length>0 && (
            card(<>
              {h3(`Daily Activity — ${opFilter}`)}
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={dailyData.map((d:any)=>{
                  const count = filteredAudit.filter((r:any)=>r.changed_at?.slice(0,10)===
                    (fromDate0.slice(0,4)+'-'+d.date)).length
                  return { ...d, updates: count }
                })}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tk.border}/>
                  <XAxis dataKey="date" tick={{fill:tk.textMuted,fontSize:10}} interval="preserveStartEnd"/>
                  <YAxis tick={{fill:tk.textMuted,fontSize:11}}/>
                  <Tooltip contentStyle={{background:'#111827',border:'1px solid #374151',borderRadius:'8px',color:'#f9fafb',fontSize:'12px'}}/>
                  <Line type="monotone" dataKey="updates" stroke="#a78bfa" strokeWidth={2} dot={false} name="Updates"/>
                </LineChart>
              </ResponsiveContainer>
            </>)
          )}
        </div>
      )}
    </div>
  )
}
