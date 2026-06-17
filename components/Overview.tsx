'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTheme, T } from '@/components/Dashboard'
import { createClient } from '@/lib/supabase/client'
import { UserProfile, CATEGORIES, TEAM_COLOR } from '@/types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts'

type OverviewTab = 'overall' | 'team' | 'time'
type Range = '7d' | '30d' | '90d' | 'custom'

interface Props { profile: UserProfile }

const STATUS_COLORS: Record<string, string> = {
  'Yes':                      '#16a34a',
  'Already Updated':          '#0d9488',
  'Not Found On Any Source':  '#d97706',
  'Player Not Found Online':  '#7c3aed',
  'Blocked':                  '#dc2626',
  'In Progress':              '#2563eb',
  'Pending':                  '#6b7280',
}
const PIE_COLORS = ['#16a34a','#0d9488','#d97706','#7c3aed','#dc2626','#2563eb','#6b7280']

function fmt(n: number) { return (n||0).toLocaleString('en-US') }

function getFromDate(range: Range, customFrom: string): Date {
  if (range === '7d')  { const d = new Date(); d.setDate(d.getDate()-7);  return d }
  if (range === '30d') { const d = new Date(); d.setDate(d.getDate()-30); return d }
  if (range === '90d') { const d = new Date(); d.setDate(d.getDate()-90); return d }
  if (range === 'custom' && customFrom) return new Date(customFrom + 'T00:00:00')
  const d = new Date(); d.setDate(d.getDate()-30); return d
}

export default function Overview({ profile }: Props) {
  const supabase = createClient()
  const theme = useTheme()
  const tk    = T[theme]

  const [tab,         setTab]         = useState<OverviewTab>('overall')
  const [range,       setRange]       = useState<Range>('30d')
  const [customFrom,  setCustomFrom]  = useState('')
  const [customTo,    setCustomTo]    = useState('')
  const [customFromH, setCustomFromH] = useState('00')
  const [customToH,   setCustomToH]   = useState('23')
  const [loading,     setLoading]     = useState(true)
  const [opFilter,    setOpFilter]    = useState('all')  // operator filter for team tab

  // Data
  const [kpis,        setKpis]        = useState({ total:0, done:0, inProgress:0, blocked:0, players:0, alreadyUpdated:0 })
  const [catBreak,    setCatBreak]    = useState<any[]>([])
  const [teamBreak,   setTeamBreak]   = useState<any[]>([])
  const [dailyData,   setDailyData]   = useState<any[]>([])
  const [hourData,    setHourData]    = useState<any[]>([])
  const [operators,   setOperators]   = useState<any[]>([])
  const [summary,     setSummary]     = useState<any[]>([])
  const [statusBreak, setStatusBreak] = useState<any[]>([])
  const [auditRaw,    setAuditRaw]    = useState<any[]>([])

  const fromDate = getFromDate(range, customFrom)
  const toDate   = (() => {
    if (range === 'custom' && customTo) {
      const d = new Date(customTo + `T${customToH}:59:59`)
      return d
    }
    return new Date()
  })()

  const load = useCallback(async () => {
    setLoading(true)
    const fromISO = fromDate.toISOString()
    const toISO   = toDate.toISOString()
    const fromDate0 = fromDate.toISOString().slice(0,10)
    const toDate0   = toDate.toISOString().slice(0,10)

    const [
      { count: total    },
      { count: done     },
      { count: inProg   },
      { count: blocked  },
      { count: players  },
      { count: alreadyU },
      { data: sumData   },
      { data: audit     },
      { data: opsRaw    },
      { data: sbData    },
    ] = await Promise.all([
      supabase.from('player_tasks').select('*',{count:'exact',head:true}),
      supabase.from('player_tasks').select('*',{count:'exact',head:true}).not('status','in','(Pending,In Progress)'),
      supabase.from('player_tasks').select('*',{count:'exact',head:true}).eq('status','In Progress'),
      supabase.from('player_tasks').select('*',{count:'exact',head:true}).eq('status','Blocked'),
      supabase.from('players').select('*',{count:'exact',head:true}),
      supabase.from('player_tasks').select('*',{count:'exact',head:true}).eq('status','Already Updated'),
      supabase.from('team_progress_summary').select('*'),
      supabase.from('daily_activity').select('*')
        .gte('activity_date', fromDate0)
        .lte('activity_date', toDate0),
      supabase.from('operator_leaderboard').select('*'),
      supabase.from('overall_status_breakdown').select('*'),
    ])

    setKpis({ total:total||0, done:done||0, inProgress:inProg||0, blocked:blocked||0, players:players||0, alreadyUpdated:alreadyU||0 })
    setSummary(sumData||[])
    setOperators(opsRaw||[])
    setStatusBreak(sbData||[])
    setAuditRaw(audit||[])

    // Category breakdown
    const catMap: Record<string,{pending:number;done:number;inProg:number}> = {}
    CATEGORIES.forEach(c => { catMap[c] = {pending:0,done:0,inProg:0} })
    ;(sumData||[]).forEach((r:any) => {
      if (catMap[r.category]) {
        catMap[r.category].pending += r.pending||0
        catMap[r.category].done    += r.completed||0
        catMap[r.category].inProg  += r.in_progress||0
      }
    })
    setCatBreak(Object.entries(catMap).map(([cat,v]) => ({
      name: cat.replace(' Update','').replace('Height & Weight','Ht/Wt'),
      Done: v.done, 'In Progress': v.inProg, Pending: v.pending
    })))

    // Team breakdown
    const teamMap: Record<string,{done:number;total:number}> = {}
    ;(sumData||[]).forEach((r:any) => {
      if (!r.team) return
      if (!teamMap[r.team]) teamMap[r.team] = {done:0,total:0}
      teamMap[r.team].done  += r.completed||0
      teamMap[r.team].total += r.total||0
    })
    setTeamBreak(Object.entries(teamMap).map(([team,v]) => ({
      team, Done: v.done, Pending: v.total-v.done,
      pct: v.total>0 ? Math.round(v.done/v.total*100) : 0
    })))

    // Daily trend — filter by IST date only (no hour filter here)
    const dayMap: Record<string,number> = {}
    ;(audit||[]).forEach((r:any) => {
      const d = r.activity_date?.slice(0,10)
      if (d) dayMap[d] = (dayMap[d]||0) + (r.task_count||0)
    })
    const days: any[] = []
    const cur = new Date(fromDate); cur.setHours(0,0,0,0)
    const end = new Date(toDate);   end.setHours(0,0,0,0)
    while (cur <= end) {
      const k = cur.toISOString().slice(0,10)
      days.push({ date: k.slice(5), updates: dayMap[k]||0 })
      cur.setDate(cur.getDate()+1)
    }
    setDailyData(days)

    // Hour of day — only count hours that have activity in the date range
    // Fix: filter by actual date range so yesterday's 11PM doesn't bleed in
    const hourMap: Record<number,number> = {}
    for (let h=0;h<24;h++) hourMap[h] = 0
    ;(audit||[]).forEach((r:any) => {
      // Only include if activity_date is within range
      const d = r.activity_date?.slice(0,10)
      if (!d || d < fromDate0 || d > toDate0) return
      const h = typeof r.hour_of_day === 'number' ? r.hour_of_day : parseInt(r.hour_of_day)
      if (!isNaN(h)) hourMap[h] = (hourMap[h]||0) + (r.task_count||0)
    })
    setHourData(Object.entries(hourMap).map(([h,v]) => ({
      hour: `${String(h).padStart(2,'0')}:00`,
      updates: v as number,
      h: parseInt(h)
    })))

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo, customFromH, customToH])

  useEffect(() => { load() }, [load])

  const pct = kpis.total > 0 ? Math.round(kpis.done/kpis.total*100) : 0

  const inp: React.CSSProperties = {
    background: tk.bgInput, border: `1px solid ${tk.border}`, borderRadius:'8px',
    padding:'6px 11px', color: tk.text, fontSize:'12px', outline:'none',
  }
  const card = (children: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius:'12px', padding:'20px', ...style }}>
      {children}
    </div>
  )
  const h3 = (text: string) => (
    <h3 style={{ color: tk.text, fontWeight:600, margin:'0 0 16px', fontSize:'14px' }}>{text}</h3>
  )

  // Operator list for filter dropdown
  const opList = Array.from(new Set(auditRaw.map((r:any) => r.operator_name).filter(Boolean)))

  // Filter audit data by selected operator
  const filteredAudit = opFilter === 'all' ? auditRaw
    : auditRaw.filter((r:any) => r.operator_name === opFilter)

  // Per-operator daily data
  const opDailyMap: Record<string,number> = {}
  filteredAudit.forEach((r:any) => {
    const d = r.activity_date?.slice(0,10)
    if (d) opDailyMap[d] = (opDailyMap[d]||0) + (r.task_count||0)
  })

  // Split operators into Players and Profile Pic
  const playerOps = operators.map((op:any) => ({
    ...op,
    relevant_count: (op.dob_count||0) + (op.htw_count||0) + (op.htn_count||0),
    relevant_done:  op.completed_count||0,
  })).filter((op:any) => op.relevant_count > 0)
  .sort((a:any,b:any) => b.relevant_count - a.relevant_count)

  const picOps = operators.map((op:any) => ({
    ...op,
    relevant_count: op.pic_count||0,
  })).filter((op:any) => op.relevant_count > 0)
  .sort((a:any,b:any) => b.relevant_count - a.relevant_count)

  // Pie chart data for status breakdown (all categories)
  const statusTotals: Record<string,number> = {}
  statusBreak.forEach((r:any) => {
    statusTotals[r.status] = (statusTotals[r.status]||0) + (r.count||0)
  })
  const pieData = Object.entries(statusTotals)
    .map(([name,value]) => ({ name, value }))
    .sort((a,b) => b.value - a.value)

  // Profile pic vs Player stats
  const picBreak  = statusBreak.filter((r:any) => r.category === 'Profile Pic Update')
  const coreBreak = statusBreak.filter((r:any) => r.category !== 'Profile Pic Update')

  const tblHeader: React.CSSProperties = {
    padding:'8px 12px', color: tk.textDim, fontSize:'10px', fontWeight:600,
    textTransform:'uppercase', textAlign:'left', borderBottom:`1px solid ${tk.border}`,
    whiteSpace:'nowrap', background: tk.tableHead,
  }
  const tblCell: React.CSSProperties = {
    padding:'10px 12px', borderBottom:`1px solid ${tk.tableRow}`,
    fontSize:'12px', color: tk.textMuted,
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

      {/* Sub-tab + date range */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'10px' }}>
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {([['overall','📊 Overall'],['team','👥 Team / Analyst'],['time','⏱ Time Analysis']] as const).map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding:'8px 16px', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight:600,
                background: tab===k?'#f97316':tk.bgInput, color: tab===k?'#fff':tk.textMuted }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
          {(['7d','30d','90d','custom'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              style={{ padding:'5px 12px', borderRadius:'99px', border:`1px solid ${tk.border}`, cursor:'pointer', fontSize:'12px',
                background: range===r?'#f97316':tk.bgInput, color: range===r?'#fff':tk.textDim }}>
              {r==='7d'?'7 Days':r==='30d'?'30 Days':r==='90d'?'90 Days':'Custom'}
            </button>
          ))}
          {range === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ ...inp, width:'130px' }} />
              <select value={customFromH} onChange={e => setCustomFromH(e.target.value)} style={{ ...inp, width:'80px' }}>
                {Array.from({length:24},(_,i) => <option key={i} value={String(i).padStart(2,'0')}>{String(i).padStart(2,'0')}:00</option>)}
              </select>
              <span style={{ color:tk.textDim }}>→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ ...inp, width:'130px' }} />
              <select value={customToH} onChange={e => setCustomToH(e.target.value)} style={{ ...inp, width:'80px' }}>
                {Array.from({length:24},(_,i) => <option key={i} value={String(i).padStart(2,'0')}>{String(i).padStart(2,'0')}:00</option>)}
              </select>
            </>
          )}
          <button onClick={load} style={{ background:'#f97316', border:'none', color:'#fff',
            padding:'5px 12px', borderRadius:'8px', cursor:'pointer', fontSize:'12px', fontWeight:600 }}>
            🔄
          </button>
        </div>
      </div>

      {loading && <div style={{ textAlign:'center', padding:'40px', color:tk.textDim }}>Loading analytics…</div>}

      {/* ── OVERALL TAB ─────────────────────────────────── */}
      {!loading && tab === 'overall' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* KPI row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'10px' }}>
            {[
              { label:'Total Players',     value:fmt(kpis.players),         icon:'👤', color:'#f97316' },
              { label:'Total Tasks',       value:fmt(kpis.total),           icon:'📋', color: tk.text  },
              { label:'Completed',         value:fmt(kpis.done),            icon:'✅', color:'#34d399' },
              { label:'Already Updated',   value:fmt(kpis.alreadyUpdated),  icon:'✔',  color:'#0d9488' },
              { label:'In Progress',       value:fmt(kpis.inProgress),      icon:'🔄', color:'#60a5fa' },
              { label:'Blocked',           value:fmt(kpis.blocked),         icon:'🚫', color:'#f87171' },
              { label:'Completion %',      value:`${pct}%`,                 icon:'📈', color:'#f97316' },
            ].map(k => (
              <div key={k.label} style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'12px', padding:'14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span style={{ color:tk.textDim, fontSize:'9px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>{k.label}</span>
                  <span style={{ fontSize:'14px' }}>{k.icon}</span>
                </div>
                <div style={{ color:k.color, fontSize:'20px', fontWeight:700 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {card(<>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
              <span style={{ color:tk.text, fontWeight:600, fontSize:'13px' }}>Overall Completion</span>
              <span style={{ color:'#f97316', fontWeight:700, fontSize:'18px' }}>{pct}%</span>
            </div>
            <div style={{ height:'10px', background:tk.bgInput, borderRadius:'99px', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#f97316,#fb923c)', borderRadius:'99px', transition:'width 0.5s' }} />
            </div>
            <p style={{ color:tk.textDim, fontSize:'12px', margin:'6px 0 0' }}>
              {fmt(kpis.done)} of {fmt(kpis.total)} tasks resolved
            </p>
          </>)}

          {/* Charts row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))', gap:'16px' }}>
            {card(<>
              {h3('Tasks by Category')}
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={catBreak}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tk.border} />
                  <XAxis dataKey="name" tick={{ fill:tk.textMuted, fontSize:11 }} />
                  <YAxis tick={{ fill:tk.textMuted, fontSize:11 }} />
                  <Tooltip contentStyle={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'8px', color:tk.text }} />
                  <Legend wrapperStyle={{ fontSize:12, color:tk.textMuted }} />
                  <Bar dataKey="Done"        fill="#16a34a" radius={[4,4,0,0]} />
                  <Bar dataKey="In Progress" fill="#2563eb" radius={[4,4,0,0]} />
                  <Bar dataKey="Pending"     fill="#4b5563" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </>)}

            {card(<>
              {h3('Status Distribution (All Tasks)')}
              <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                      {pieData.map((_:any, i:number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'8px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'5px' }}>
                  {pieData.map((d:any, i:number) => (
                    <div key={d.name} style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                      <div style={{ width:'10px', height:'10px', borderRadius:'2px', background:PIE_COLORS[i%PIE_COLORS.length], flexShrink:0 }} />
                      <span style={{ color:tk.textMuted, fontSize:'10px', flex:1 }}>{d.name}</span>
                      <span style={{ color:tk.text, fontSize:'11px', fontWeight:600 }}>{fmt(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>)}
          </div>

          {/* Player tasks vs Profile Pic split */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
            {card(<>
              {h3('👤 Player Tasks (DOB + Ht/Wt + Hometown)')}
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {['Yes','Already Updated','Not Found On Any Source','Player Not Found Online','Blocked','In Progress','Pending'].map(status => {
                  const count = coreBreak.filter((r:any)=>r.status===status).reduce((s:number,r:any)=>s+(r.count||0),0)
                  const total = coreBreak.reduce((s:number,r:any)=>s+(r.count||0),0)
                  const pct2  = total > 0 ? Math.round(count/total*100) : 0
                  if (!count) return null
                  return (
                    <div key={status}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'2px' }}>
                        <span style={{ fontSize:'11px', color:tk.textMuted }}>{status}</span>
                        <span style={{ fontSize:'11px', fontWeight:600, color:STATUS_COLORS[status]||tk.text }}>{fmt(count)} ({pct2}%)</span>
                      </div>
                      <div style={{ height:'6px', background:tk.bgInput, borderRadius:'99px', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct2}%`, background:STATUS_COLORS[status]||'#6b7280', borderRadius:'99px' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>)}

            {card(<>
              {h3('📸 Profile Pic Tasks')}
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {['Yes','Already Updated','Not Found On Any Source','Player Not Found Online','Blocked','In Progress','Pending'].map(status => {
                  const count = picBreak.filter((r:any)=>r.status===status).reduce((s:number,r:any)=>s+(r.count||0),0)
                  const total = picBreak.reduce((s:number,r:any)=>s+(r.count||0),0)
                  const pct2  = total > 0 ? Math.round(count/total*100) : 0
                  if (!count) return null
                  return (
                    <div key={status}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'2px' }}>
                        <span style={{ fontSize:'11px', color:tk.textMuted }}>{status}</span>
                        <span style={{ fontSize:'11px', fontWeight:600, color:STATUS_COLORS[status]||tk.text }}>{fmt(count)} ({pct2}%)</span>
                      </div>
                      <div style={{ height:'6px', background:tk.bgInput, borderRadius:'99px', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct2}%`, background:STATUS_COLORS[status]||'#6b7280', borderRadius:'99px' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>)}
          </div>

          {/* Category status breakdown table */}
          {card(<>
            {h3('Category × Status Breakdown')}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {['Category','✅ Yes','✔ Already Upd.','❌ Not Found','🔍 Not Online','🚫 Blocked','🔄 In Progress','⏳ Pending','Total'].map(h => (
                      <th key={h} style={tblHeader}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map(cat => {
                    const rows = statusBreak.filter((r:any)=>r.category===cat)
                    const get  = (s:string) => rows.find((r:any)=>r.status===s)?.count||0
                    const tot  = rows.reduce((s:number,r:any)=>s+(r.count||0),0)
                    return (
                      <tr key={cat}>
                        <td style={{ ...tblCell, color:tk.text, fontWeight:600 }}>{cat}</td>
                        <td style={tblCell}><span style={{ color:'#16a34a', fontWeight:700 }}>{fmt(get('Yes'))}</span></td>
                        <td style={tblCell}><span style={{ color:'#0d9488' }}>{fmt(get('Already Updated'))}</span></td>
                        <td style={tblCell}><span style={{ color:'#d97706' }}>{fmt(get('Not Found On Any Source'))}</span></td>
                        <td style={tblCell}><span style={{ color:'#7c3aed' }}>{fmt(get('Player Not Found Online'))}</span></td>
                        <td style={tblCell}><span style={{ color:'#dc2626' }}>{fmt(get('Blocked'))}</span></td>
                        <td style={tblCell}><span style={{ color:'#2563eb' }}>{fmt(get('In Progress'))}</span></td>
                        <td style={tblCell}><span style={{ color:tk.textFaint }}>{fmt(get('Pending'))}</span></td>
                        <td style={{ ...tblCell, color:tk.textDim, fontWeight:600 }}>{fmt(tot)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>)}
        </div>
      )}

      {/* ── TEAM / ANALYST TAB ──────────────────────────── */}
      {!loading && tab === 'team' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* Operator filter */}
          <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
            <label style={{ color:tk.textMuted, fontSize:'12px', fontWeight:600 }}>Filter by Operator:</label>
            <select value={opFilter} onChange={e => setOpFilter(e.target.value)} style={{ ...inp }}>
              <option value="all">All Operators</option>
              {opList.map((op:any) => <option key={op} value={op}>{op}</option>)}
            </select>
            {opFilter !== 'all' && (
              <button onClick={() => setOpFilter('all')}
                style={{ background:'none', border:`1px solid ${tk.border}`, color:tk.textDim,
                  padding:'5px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'12px' }}>
                ✕ Clear
              </button>
            )}
          </div>

          {/* Team completion % cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:'12px' }}>
            {teamBreak.map((t:any) => (
              <div key={t.team} style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'12px', padding:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'10px' }}>
                  <span style={{ color:TEAM_COLOR[t.team as 'Cairo'|'India'|'Admin']||'#fff', fontWeight:700, fontSize:'16px' }}>{t.team}</span>
                  <span style={{ color:'#f97316', fontWeight:700, fontSize:'22px' }}>{t.pct}%</span>
                </div>
                <div style={{ height:'8px', background:tk.bgInput, borderRadius:'99px', overflow:'hidden', marginBottom:'8px' }}>
                  <div style={{ height:'100%', width:`${t.pct}%`, background:TEAM_COLOR[t.team as 'Cairo'|'India'|'Admin']||'#f97316', borderRadius:'99px' }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:tk.textDim, fontSize:'11px' }}>✅ {fmt(t.Done)} done</span>
                  <span style={{ color:tk.textFaint, fontSize:'11px' }}>⏳ {fmt(t.Pending)} pending</span>
                </div>
              </div>
            ))}
          </div>

          {/* 👤 Players leaderboard */}
          {card(<>
            {h3('👤 Player Task Leaderboard (DOB + Ht/Wt + Hometown)')}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {['#','Operator','Team','Total','Completed','DOB','Ht/Wt','Hometown','Active Days','Last Active'].map(h => (
                      <th key={h} style={tblHeader}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(opFilter === 'all' ? playerOps : playerOps.filter((op:any) => op.operator_name === opFilter))
                    .length === 0 ? (
                    <tr><td colSpan={10} style={{ ...tblCell, textAlign:'center', color:tk.textFaint, padding:'32px' }}>No activity yet</td></tr>
                  ) : (opFilter === 'all' ? playerOps : playerOps.filter((op:any) => op.operator_name === opFilter))
                    .map((op:any, i:number) => (
                    <tr key={op.operator_id||i}
                      onMouseEnter={e => (e.currentTarget.style.background=tk.rowHover)}
                      onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                      <td style={{ ...tblCell, color:tk.textFaint, fontSize:'13px' }}>
                        {i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}
                      </td>
                      <td style={{ ...tblCell, color:tk.text, fontWeight:600, whiteSpace:'nowrap' }}>{op.operator_name||'—'}</td>
                      <td style={tblCell}>
                        <span style={{ color:TEAM_COLOR[op.team as 'Cairo'|'India'|'Admin']||tk.textMuted, fontSize:'12px', fontWeight:600 }}>{op.team||'—'}</span>
                      </td>
                      <td style={{ ...tblCell, color:'#f97316', fontWeight:700 }}>{fmt(op.relevant_count)}</td>
                      <td style={{ ...tblCell, color:'#34d399' }}>{fmt(op.completed_count)}</td>
                      <td style={tblCell}>{fmt(op.dob_count)}</td>
                      <td style={tblCell}>{fmt(op.htw_count)}</td>
                      <td style={tblCell}>{fmt(op.htn_count)}</td>
                      <td style={tblCell}>{op.active_days||0}</td>
                      <td style={{ ...tblCell, whiteSpace:'nowrap', fontSize:'11px' }}>
                        {op.last_activity ? new Date(op.last_activity).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {/* 📸 Profile Pic leaderboard */}
          {card(<>
            {h3('📸 Profile Pic Leaderboard')}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {['#','Operator','Team','Pic Tasks','Active Days','Last Active'].map(h => (
                      <th key={h} style={tblHeader}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(opFilter === 'all' ? picOps : picOps.filter((op:any) => op.operator_name === opFilter))
                    .length === 0 ? (
                    <tr><td colSpan={6} style={{ ...tblCell, textAlign:'center', color:tk.textFaint, padding:'32px' }}>No profile pic activity yet</td></tr>
                  ) : (opFilter === 'all' ? picOps : picOps.filter((op:any) => op.operator_name === opFilter))
                    .map((op:any, i:number) => (
                    <tr key={op.operator_id||i}
                      onMouseEnter={e => (e.currentTarget.style.background=tk.rowHover)}
                      onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                      <td style={{ ...tblCell, color:tk.textFaint, fontSize:'13px' }}>
                        {i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}
                      </td>
                      <td style={{ ...tblCell, color:tk.text, fontWeight:600, whiteSpace:'nowrap' }}>{op.operator_name||'—'}</td>
                      <td style={tblCell}>
                        <span style={{ color:TEAM_COLOR[op.team as 'Cairo'|'India'|'Admin']||tk.textMuted, fontSize:'12px', fontWeight:600 }}>{op.team||'—'}</span>
                      </td>
                      <td style={{ ...tblCell, color:'#a78bfa', fontWeight:700 }}>{fmt(op.pic_count)}</td>
                      <td style={tblCell}>{op.active_days||0}</td>
                      <td style={{ ...tblCell, whiteSpace:'nowrap', fontSize:'11px' }}>
                        {op.last_activity ? new Date(op.last_activity).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {/* Team × category bar chart */}
          {card(<>
            {h3('Completed Tasks per Team × Category')}
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={CATEGORIES.map(cat => {
                const row: any = { name: cat.replace(' Update','').replace('Height & Weight','Ht/Wt') }
                ;['Cairo','India'].forEach(team => {
                  const s = summary.find((r:any) => r.team===team && r.category===cat)
                  row[team] = s?.completed||0
                })
                return row
              })}>
                <CartesianGrid strokeDasharray="3 3" stroke={tk.border} />
                <XAxis dataKey="name" tick={{ fill:tk.textMuted, fontSize:11 }} />
                <YAxis tick={{ fill:tk.textMuted, fontSize:11 }} />
                <Tooltip contentStyle={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'8px' }} />
                <Legend wrapperStyle={{ fontSize:12 }} />
                <Bar dataKey="Cairo" fill="#f97316" radius={[4,4,0,0]} />
                <Bar dataKey="India" fill="#3b82f6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </>)}
        </div>
      )}

      {/* ── TIME ANALYSIS TAB ──────────────────────────── */}
      {!loading && tab === 'time' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* Summary stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:'10px' }}>
            {[
              { label:'Most Active Hour', value: hourData.reduce((a:any,b:any)=>b.updates>a.updates?b:a,{hour:'—',updates:0}).hour, icon:'⏰' },
              { label:'Peak Day Updates', value: fmt(Math.max(...dailyData.map((d:any)=>d.updates),0)),                              icon:'🔥' },
              { label:'Avg Daily',        value: dailyData.filter((d:any)=>d.updates>0).length > 0
                ? fmt(Math.round(dailyData.reduce((s:number,d:any)=>s+d.updates,0)/dailyData.filter((d:any)=>d.updates>0).length))
                : '0',                                                                                                               icon:'📊' },
              { label:'Total in Period',  value: fmt(dailyData.reduce((s:number,d:any)=>s+d.updates,0)),                             icon:'📈' },
              { label:'Active Operators', value: fmt(opList.length),                                                                 icon:'👥' },
            ].map(k => (
              <div key={k.label} style={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'12px', padding:'14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span style={{ color:tk.textDim, fontSize:'9px', fontWeight:600, textTransform:'uppercase' }}>{k.label}</span>
                  <span style={{ fontSize:'14px' }}>{k.icon}</span>
                </div>
                <div style={{ color:'#f97316', fontSize:'20px', fontWeight:700 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Daily trend */}
          {card(<>
            {h3(`Daily Updates — ${range==='custom' ? `${customFrom} ${customFromH}:00 → ${customTo} ${customToH}:59` : range}`)}
            {dailyData.length === 0 || dailyData.every((d:any) => d.updates === 0) ? (
              <p style={{ color:tk.textFaint, textAlign:'center', padding:'40px 0' }}>No activity in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={tk.border} />
                  <XAxis dataKey="date" tick={{ fill:tk.textMuted, fontSize:10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill:tk.textMuted, fontSize:11 }} />
                  <Tooltip contentStyle={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'8px', color:tk.text }} />
                  <Area type="monotone" dataKey="updates" stroke="#f97316" strokeWidth={2} fill="url(#ag)" name="Updates" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </>)}

          {/* Hour of day — only show hours with data */}
          {card(<>
            {h3('Activity by Hour of Day (IST) — current period only')}
            {hourData.every((d:any) => d.updates === 0) ? (
              <p style={{ color:tk.textFaint, textAlign:'center', padding:'40px 0' }}>No activity in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourData.filter((d:any) => d.updates > 0 || hourData.some((x:any)=>x.updates>0))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tk.border} />
                  <XAxis dataKey="hour" tick={{ fill:tk.textMuted, fontSize:10 }} interval={1} />
                  <YAxis tick={{ fill:tk.textMuted, fontSize:11 }} />
                  <Tooltip contentStyle={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'8px' }}
                    formatter={(v:any) => [v, 'Updates']} labelFormatter={l => `Hour: ${l}`} />
                  <Bar dataKey="updates" radius={[4,4,0,0]} name="Updates">
                    {hourData.map((entry:any, i:number) => {
                      const maxVal = Math.max(...hourData.map((d:any)=>d.updates))
                      return <Cell key={i} fill={entry.updates === maxVal && maxVal > 0 ? '#f97316' : '#2563eb'} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <p style={{ color:tk.textDim, fontSize:'11px', margin:'8px 0 0' }}>
              🟠 Peak hour · 🔵 Other hours · All times IST (UTC+5:30) · Only current date range shown
            </p>
          </>)}

          {/* Per-operator daily line chart */}
          {opFilter !== 'all' && (
            card(<>
              {h3(`Daily activity — ${opFilter}`)}
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={dailyData.map(d => ({
                  ...d,
                  updates: opDailyMap[d.date] || 0
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tk.border} />
                  <XAxis dataKey="date" tick={{ fill:tk.textMuted, fontSize:10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill:tk.textMuted, fontSize:11 }} />
                  <Tooltip contentStyle={{ background:tk.bgCard, border:`1px solid ${tk.border}`, borderRadius:'8px' }} />
                  <Line type="monotone" dataKey="updates" stroke="#a78bfa" strokeWidth={2} dot={false} name="Updates" />
                </LineChart>
              </ResponsiveContainer>
            </>)
          )}
        </div>
      )}
    </div>
  )
}
