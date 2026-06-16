'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTheme, T } from '@/components/Dashboard'
import { createClient } from '@/lib/supabase/client'
import { UserProfile, CATEGORIES, TEAM_COLOR } from '@/types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'

type OverviewTab = 'overall' | 'team' | 'time'
type Range = '7d' | '30d' | '90d' | 'custom'

interface Props { profile: UserProfile }

const COLORS = ['#f97316','#3b82f6','#22c55e','#a855f7','#ec4899','#14b8a6','#f59e0b']

function fmt(n: number) { return n.toLocaleString('en-US') }

function dateFromRange(range: Range, customFrom?: string): Date {
  const now = new Date()
  if (range === '7d')  { const d = new Date(); d.setDate(d.getDate()-7); return d }
  if (range === '30d') { const d = new Date(); d.setDate(d.getDate()-30); return d }
  if (range === '90d') { const d = new Date(); d.setDate(d.getDate()-90); return d }
  if (range === 'custom' && customFrom) return new Date(customFrom)
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export default function Overview({ profile }: Props) {
  const supabase = createClient()
  const theme = useTheme()
  const tk    = T[theme]
  const [tab,        setTab]        = useState<OverviewTab>('overall')
  const [range,      setRange]      = useState<Range>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')
  const [loading,    setLoading]    = useState(true)

  // Data
  const [kpis,       setKpis]       = useState({ total:0, done:0, inProgress:0, blocked:0, players:0 })
  const [catBreak,   setCatBreak]   = useState<any[]>([])
  const [teamBreak,  setTeamBreak]  = useState<any[]>([])
  const [dailyData,  setDailyData]  = useState<any[]>([])
  const [hourData,   setHourData]   = useState<any[]>([])
  const [operators,  setOperators]  = useState<any[]>([])
  const [summary,    setSummary]    = useState<any[]>([])
  const [statusBreak,setStatusBreak] = useState<any[]>([])

  const fromDate = dateFromRange(range, customFrom)
  const toDate   = range === 'custom' && customTo ? new Date(customTo) : new Date()
  toDate.setHours(23, 59, 59)

  const load = useCallback(async () => {
    setLoading(true)
    const fromISO = fromDate.toISOString()
    const toISO   = toDate.toISOString()

    const [
      { count: total },
      { count: done },
      { count: inProg },
      { count: blocked },
      { count: players },
      { data: sumData },
      { data: auditRaw },
      { data: opsRaw },
      { data: sbData },
    ] = await Promise.all([
      supabase.from('player_tasks').select('*', { count:'exact', head:true }),
      supabase.from('player_tasks').select('*', { count:'exact', head:true }).not('status','in','(Pending,In Progress)'),
      supabase.from('player_tasks').select('*', { count:'exact', head:true }).eq('status','In Progress'),
      supabase.from('player_tasks').select('*', { count:'exact', head:true }).eq('status','Blocked'),
      supabase.from('players').select('*', { count:'exact', head:true }),
      supabase.from('team_progress_summary').select('*'),
      supabase.from('daily_activity').select('*').gte('activity_date', fromISO.slice(0,10)).lte('activity_date', toISO.slice(0,10)),
      supabase.from('operator_leaderboard').select('*'),
      supabase.from('overall_status_breakdown').select('*'),
    ])

    setKpis({ total: total||0, done: done||0, inProgress: inProg||0, blocked: blocked||0, players: players||0 })
    setSummary(sumData || [])
    setOperators(opsRaw || [])
    setStatusBreak(sbData || [])

    // Category breakdown from summary
    const catMap: Record<string, { pending:number; done:number; inProgress:number }> = {}
    CATEGORIES.forEach(c => { catMap[c] = { pending:0, done:0, inProgress:0 } })
    ;(sumData || []).forEach((r: any) => {
      if (catMap[r.category]) {
        catMap[r.category].pending    += r.pending || 0
        catMap[r.category].done       += r.completed || 0
        catMap[r.category].inProgress += r.in_progress || 0
      }
    })
    setCatBreak(Object.entries(catMap).map(([cat, v]) => ({
      name: cat.replace(' Update','').replace('Height & Weight','Ht/Wt'),
      Done: v.done, 'In Progress': v.inProgress, Pending: v.pending
    })))

    // Team breakdown
    const teamMap: Record<string, { done:number; total:number }> = {}
    ;(sumData || []).forEach((r: any) => {
      if (!r.team) return
      if (!teamMap[r.team]) teamMap[r.team] = { done:0, total:0 }
      teamMap[r.team].done  += r.completed || 0
      teamMap[r.team].total += r.total || 0
    })
    setTeamBreak(Object.entries(teamMap).map(([team, v]) => ({
      team,
      Done: v.done,
      Pending: v.total - v.done,
      pct: v.total > 0 ? Math.round(v.done/v.total*100) : 0
    })))

    // Daily trend from audit
    const dayMap: Record<string, number> = {}
    ;(auditRaw || []).forEach((r: any) => {
      const d = r.activity_date?.slice(0, 10)
      if (d) dayMap[d] = (dayMap[d] || 0) + (r.task_count || 0)
    })
    // Fill gaps
    const days: any[] = []
    const cur = new Date(fromDate); cur.setHours(0,0,0,0)
    const end = new Date(toDate);   end.setHours(0,0,0,0)
    while (cur <= end) {
      const k = cur.toISOString().slice(0,10)
      days.push({ date: k.slice(5), updates: dayMap[k] || 0 })
      cur.setDate(cur.getDate()+1)
    }
    setDailyData(days)

    // Hour of day
    const hourMap: Record<number, number> = {}
    for (let h = 0; h < 24; h++) hourMap[h] = 0
    ;(auditRaw || []).forEach((r: any) => {
      const h = r.hour_of_day
      if (h != null) hourMap[h] = (hourMap[h] || 0) + (r.task_count || 0)
    })
    setHourData(Object.entries(hourMap).map(([h, v]) => ({
      hour: `${h.padStart(2,'0')}:00`, updates: v
    })))

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo])

  useEffect(() => { load() }, [load])

  const pct = kpis.total > 0 ? Math.round(kpis.done / kpis.total * 100) : 0

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

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

      {/* Sub-tab bar + date range */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'10px' }}>
        <div style={{ display:'flex', gap:'6px' }}>
          {([['overall','📊 Overall'],['team','👥 Team / Analyst'],['time','⏱ Time Analysis']] as const).map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding:'8px 16px', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight:600,
                background: tab===k?'#f97316':tk.bgInput, color: tab===k?'#fff':tk.textMuted }}>
              {l}
            </button>
          ))}
        </div>

        {/* Date range picker */}
        <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
          {(['7d','30d','90d','custom'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              style={{ padding:'5px 12px', borderRadius:'99px', border:'none', cursor:'pointer', fontSize:'12px',
                background: range===r?tk.borderLight:tk.bgInput, color: range===r?'#fff':tk.textDim }}>
              {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : r === '90d' ? '90 Days' : 'Custom'}
            </button>
          ))}
          {range === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={inp} />
              <span style={{ color:tk.textDim }}>→</span>
              <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   style={inp} />
            </>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign:'center', padding:'40px', color:tk.textDim }}>Loading analytics…</div>
      )}

      {!loading && tab === 'overall' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* KPI row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'12px' }}>
            {[
              { label:'Total Players',  value:fmt(kpis.players),    icon:'👤', color:'#fff'    },
              { label:'Total Tasks',    value:fmt(kpis.total),      icon:'📋', color:'#fff'    },
              { label:'Completed',      value:fmt(kpis.done),       icon:'✅', color:'#34d399' },
              { label:'In Progress',    value:fmt(kpis.inProgress), icon:'🔄', color:'#60a5fa' },
              { label:'Blocked',        value:fmt(kpis.blocked),    icon:'🚫', color:'#f87171' },
              { label:'Overall %',      value:`${pct}%`,            icon:'📈', color:'#f97316' },
            ].map(k => (
              <div key={k.label} style={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius:'12px', padding:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                  <span style={{ color:tk.textDim, fontSize:'10px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{k.label}</span>
                  <span style={{ fontSize:'16px' }}>{k.icon}</span>
                </div>
                <div style={{ color:k.color, fontSize:'22px', fontWeight:700 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {card(<>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'10px' }}>
              <span style={{ color:'#fff', fontWeight:600 }}>Overall Completion</span>
              <span style={{ color:'#f97316', fontWeight:700, fontSize:'18px' }}>{pct}%</span>
            </div>
            <div style={{ height:'12px', background:tk.bgInput, borderRadius:'99px', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#f97316,#fb923c)', borderRadius:'99px', transition:'width 0.5s' }} />
            </div>
            <p style={{ color:tk.textDim, fontSize:'12px', margin:'8px 0 0' }}>
              {fmt(kpis.done)} of {fmt(kpis.total)} tasks completed
            </p>
          </>)}

          {/* Category + team charts */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))', gap:'16px' }}>
            {card(<>
              {h3('Tasks by Category')}
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={catBreak}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" />
                  <XAxis dataKey="name" tick={{ fill: tk.textMuted, fontSize:11 }} />
                  <YAxis tick={{ fill: tk.textMuted, fontSize:11 }} />
                  <Tooltip contentStyle={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius:'8px' }} />
                  <Legend wrapperStyle={{ fontSize:12 }} />
                  <Bar dataKey="Done"        fill="#16a34a" radius={[4,4,0,0]} />
                  <Bar dataKey="In Progress" fill="#2563eb" radius={[4,4,0,0]} />
                  <Bar dataKey="Pending"     fill="#374151" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </>)}

            {card(<>
              {h3('Tasks by Team')}
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={teamBreak} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" />
                  <XAxis type="number" tick={{ fill: tk.textMuted, fontSize:11 }} />
                  <YAxis type="category" dataKey="team" tick={{ fill: tk.textMuted, fontSize:12 }} width={50} />
                  <Tooltip contentStyle={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius:'8px' }} />
                  <Legend wrapperStyle={{ fontSize:12 }} />
                  <Bar dataKey="Done"    fill="#16a34a" radius={[0,4,4,0]} />
                  <Bar dataKey="Pending" fill="#374151" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display:'flex', gap:'16px', marginTop:'12px' }}>
                {teamBreak.map(t => (
                  <div key={t.team} style={{ flex:1, background:tk.bgInput, borderRadius:'8px', padding:'10px', textAlign:'center' }}>
                    <div style={{ color: TEAM_COLOR[t.team as 'Cairo'|'India'|'Admin'] || '#fff', fontWeight:700, fontSize:'18px' }}>{t.pct}%</div>
                    <div style={{ color:tk.textDim, fontSize:'11px' }}>{t.team}</div>
                  </div>
                ))}
              </div>
            </>)}
          </div>

          {/* Status breakdown per category */}
          {card(<>
            {h3('Category Status Breakdown — What happened to each field?')}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background: tk.tableHead }}>
                    {['Category','✅ Yes','✔ Already Updated','❌ Not Found Online','🔍 Player Not Found','🚫 Blocked','🔄 In Progress','⏳ Pending','Total'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', color: tk.textDim, fontSize:'10px', fontWeight:600,
                        textTransform:'uppercase', textAlign:'left', borderBottom:`1px solid ${tk.border}`, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map(cat => {
                    const catRows = statusBreak.filter((r:any) => r.category === cat)
                    const get = (s: string) => catRows.find((r:any) => r.status === s)?.count || 0
                    const total = catRows.reduce((s:number,r:any) => s + (r.count||0), 0)
                    return (
                      <tr key={cat} style={{ borderBottom:'1px solid #1f2937' }}>
                        <td style={{ padding:'10px 12px', color:tk.text, fontSize:'13px', fontWeight:500 }}>{cat}</td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ color:'#34d399', fontWeight:700 }}>{fmt(get('Yes'))}</span>
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ color:'#6ee7b7', fontWeight:600 }}>{fmt(get('Already Updated'))}</span>
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ color:'#f59e0b' }}>{fmt(get('Not Found On Any Source'))}</span>
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ color:'#a78bfa' }}>{fmt(get('Player Not Found Online'))}</span>
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ color:'#f87171' }}>{fmt(get('Blocked'))}</span>
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ color:'#60a5fa' }}>{fmt(get('In Progress'))}</span>
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ color:tk.textMuted }}>{fmt(get('Pending'))}</span>
                        </td>
                        <td style={{ padding:'10px 12px', color:tk.textDim, fontSize:'12px' }}>{fmt(total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>)}

          {/* Category detail table */}
          {card(<>
            {h3('Category × Team Breakdown')}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background: tk.tableHead }}>
                    {['Team','Category','Pending','In Progress','Done','Total','%'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', color:tk.textDim, fontSize:'11px', fontWeight:600, textTransform:'uppercase', textAlign:'left', borderBottom:'1px solid #2e3347' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r: any, i: number) => (
                    <tr key={i} style={{ borderBottom:'1px solid #1f2937' }}>
                      <td style={{ padding:'10px 12px' }}>
                        <span style={{ color: TEAM_COLOR[r.team as 'Cairo'|'India'|'Admin'] || '#fff', fontWeight:600, fontSize:'13px' }}>{r.team}</span>
                      </td>
                      <td style={{ padding:'10px 12px', color:tk.text, fontSize:'13px' }}>{r.category}</td>
                      <td style={{ padding:'10px 12px', color:tk.textMuted, fontSize:'13px' }}>{fmt(r.pending)}</td>
                      <td style={{ padding:'10px 12px', color:'#60a5fa', fontSize:'13px' }}>{fmt(r.in_progress)}</td>
                      <td style={{ padding:'10px 12px', color:'#34d399', fontSize:'13px', fontWeight:600 }}>{fmt(r.completed)}</td>
                      <td style={{ padding:'10px 12px', color:tk.textMuted, fontSize:'13px' }}>{fmt(r.total)}</td>
                      <td style={{ padding:'10px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                          <div style={{ width:'60px', height:'5px', background:tk.borderLight, borderRadius:'99px' }}>
                            <div style={{ height:'100%', width:`${r.completion_pct}%`, background:'#16a34a', borderRadius:'99px' }} />
                          </div>
                          <span style={{ color:tk.textMuted, fontSize:'11px' }}>{r.completion_pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}
        </div>
      )}

      {!loading && tab === 'team' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
          {/* Operator leaderboard */}
          {card(<>
            {h3(`🏆 Operator Leaderboard`)}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background: tk.tableHead }}>
                    {['#','Operator','Team','Total Updates','Completed','DOB','Ht/Wt','Hometown','Pic','Active Days','Last Active'].map(h => (
                      <th key={h} style={{ padding:'8px 10px', color:tk.textDim, fontSize:'10px', fontWeight:600, textTransform:'uppercase', textAlign:'left', borderBottom:'1px solid #2e3347', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {operators.length === 0 ? (
                    <tr><td colSpan={11} style={{ padding:'32px', textAlign:'center', color:tk.textFaint }}>No activity yet in this period</td></tr>
                  ) : operators.map((op: any, i: number) => (
                    <tr key={op.operator_id || i} style={{ borderBottom:'1px solid #1f2937' }}
                      onMouseEnter={e => (e.currentTarget.style.background='#0f1623')}
                      onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                      <td style={{ padding:'10px', color:tk.textFaint, fontFamily:'monospace', fontSize:'12px' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i+1}
                      </td>
                      <td style={{ padding:'10px', color:tk.text, fontWeight:600, fontSize:'13px', whiteSpace:'nowrap' }}>{op.operator_name || '—'}</td>
                      <td style={{ padding:'10px' }}>
                        <span style={{ color: TEAM_COLOR[op.team as 'Cairo'|'India'|'Admin'] || tk.textMuted, fontSize:'12px', fontWeight:600 }}>{op.team || '—'}</span>
                      </td>
                      <td style={{ padding:'10px', color:'#f97316', fontWeight:700, fontSize:'13px' }}>{fmt(op.total_updates)}</td>
                      <td style={{ padding:'10px', color:'#34d399', fontSize:'13px' }}>{fmt(op.completed_count)}</td>
                      <td style={{ padding:'10px', color:tk.textMuted, fontSize:'12px' }}>{fmt(op.dob_count)}</td>
                      <td style={{ padding:'10px', color:tk.textMuted, fontSize:'12px' }}>{fmt(op.htw_count)}</td>
                      <td style={{ padding:'10px', color:tk.textMuted, fontSize:'12px' }}>{fmt(op.htn_count)}</td>
                      <td style={{ padding:'10px', color:tk.textMuted, fontSize:'12px' }}>{fmt(op.pic_count)}</td>
                      <td style={{ padding:'10px', color:tk.textMuted, fontSize:'12px' }}>{op.active_days}</td>
                      <td style={{ padding:'10px', color:tk.textDim, fontSize:'11px', whiteSpace:'nowrap' }}>
                        {op.last_activity ? new Date(op.last_activity).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {/* Team category bars */}
          {card(<>
            {h3('Completed Tasks per Team')}
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={CATEGORIES.map(cat => {
                const row: any = { name: cat.replace(' Update','').replace('Height & Weight','Ht/Wt') }
                ;['Cairo','India'].forEach(team => {
                  const s = summary.find((r: any) => r.team === team && r.category === cat)
                  row[team] = s?.completed || 0
                })
                return row
              })}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" />
                <XAxis dataKey="name" tick={{ fill: tk.textMuted, fontSize:11 }} />
                <YAxis tick={{ fill: tk.textMuted, fontSize:11 }} />
                <Tooltip contentStyle={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius:'8px' }} />
                <Legend wrapperStyle={{ fontSize:12 }} />
                <Bar dataKey="Cairo" fill="#f97316" radius={[4,4,0,0]} />
                <Bar dataKey="India" fill="#3b82f6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </>)}
        </div>
      )}

      {!loading && tab === 'time' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
          {/* Daily trend */}
          {card(<>
            {h3(`Daily Updates (${range === 'custom' ? `${customFrom} → ${customTo}` : range})`)}
            {dailyData.length === 0 ? (
              <p style={{ color:tk.textFaint, textAlign:'center', padding:'40px 0' }}>No activity in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" />
                  <XAxis dataKey="date" tick={{ fill:tk.textMuted, fontSize:10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: tk.textMuted, fontSize:11 }} />
                  <Tooltip contentStyle={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius:'8px' }} />
                  <Area type="monotone" dataKey="updates" stroke="#f97316" strokeWidth={2} fill="url(#areaGrad)" name="Updates" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </>)}

          {/* Hour of day heatmap */}
          {card(<>
            {h3('Activity by Hour of Day (IST)')}
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hourData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" />
                <XAxis dataKey="hour" tick={{ fill:tk.textMuted, fontSize:10 }} interval={1} />
                <YAxis tick={{ fill: tk.textMuted, fontSize:11 }} />
                <Tooltip contentStyle={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius:'8px' }}
                  formatter={(v: any) => [v, 'Updates']}
                  labelFormatter={l => `Hour: ${l}`} />
                <Bar dataKey="updates" radius={[4,4,0,0]}
                  fill="#f97316"
                  label={false}>
                  {hourData.map((entry, i) => (
                    <Cell key={i}
                      fill={entry.updates === Math.max(...hourData.map((d:any)=>d.updates)) ? '#f97316' : '#1d4ed8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p style={{ color:tk.textDim, fontSize:'11px', margin:'8px 0 0' }}>
              Peak hour highlighted in orange · All times in IST (UTC+5:30)
            </p>
          </>)}

          {/* Summary stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'12px' }}>
            {[
              { label:'Most Active Hour', value: hourData.reduce((a,b)=>b.updates>a.updates?b:a,{hour:'—',updates:0}).hour, icon:'⏰' },
              { label:'Peak Day Updates', value: fmt(Math.max(...dailyData.map((d:any)=>d.updates),0)), icon:'🔥' },
              { label:'Avg Daily Updates', value: dailyData.length > 0 ? fmt(Math.round(dailyData.reduce((s:number,d:any)=>s+d.updates,0)/dailyData.filter((d:any)=>d.updates>0).length||0)) : '0', icon:'📊' },
              { label:'Active Operators', value: fmt(operators.length), icon:'👤' },
            ].map(k => (
              <div key={k.label} style={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius:'12px', padding:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                  <span style={{ color: tk.textDim, fontSize:'10px', fontWeight:600, textTransform:'uppercase' }}>{k.label}</span>
                  <span style={{ fontSize:'16px' }}>{k.icon}</span>
                </div>
                <div style={{ color:'#f97316', fontSize:'20px', fontWeight:700 }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
