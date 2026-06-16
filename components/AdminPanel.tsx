'use client'
import { useTheme, T } from '@/components/Dashboard'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserProfile, Team, Role } from '@/types'

interface FullProfile extends UserProfile {
  is_active: boolean | null
  created_at: string
}

interface Props { profile: UserProfile }

export default function AdminPanel({ profile }: Props) {
  const supabase = createClient()
  const theme = useTheme()
  const tk    = T[theme]
  const [users,    setUsers]    = useState<FullProfile[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState<string | null>(null)
  const [msg,      setMsg]      = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // New user form
  const [form, setForm] = useState({
    email: '', password: '', full_name: '', team: 'Cairo' as Team, role: 'operator' as 'operator' | 'admin'
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    setMsg(null)

    // Retry up to 3 times — handles cold-start session delay after deploys
    let data = null
    let lastErr = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: d, error: e } = await supabase
        .from('user_profiles')
        .select('*')
        .order('team').order('full_name')
      if (d && d.length > 0) { data = d; break }
      if (e) lastErr = e
      if (attempt < 2) await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
    }

    if (lastErr && !data) {
      setMsg({ type: 'err', text: `Failed to load users: ${lastErr.message}` })
    }
    setUsers((data || []) as FullProfile[])
    setLoading(false)
  }

  async function updateUser(userId: string, patch: Partial<{ role: Role; team: Team; is_active: boolean }>) {
    setSaving(userId); setMsg(null)
    const { error } = await supabase.from('user_profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', userId)
    if (error) {
      setMsg({ type: 'err', text: error.message })
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...patch } : u))
      setMsg({ type: 'ok', text: 'User updated successfully' })
    }
    setSaving(null)
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true); setMsg(null)
    const res  = await fetch('/api/admin/create-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
    })
    const json = await res.json()
    if (!res.ok) {
      setMsg({ type: 'err', text: json.error || 'Failed to create user' })
    } else {
      setMsg({ type: 'ok', text: `✅ User ${form.email} created` })
      setUsers(prev => [...prev, json.user as FullProfile])
      setForm({ email: '', password: '', full_name: '', team: 'Cairo', role: 'operator' })
    }
    setCreating(false)
  }

  const inp: React.CSSProperties = {
    background: tk.bgInput, border: `1px solid ${tk.borderLight}`, borderRadius: '8px',
    padding: '8px 12px', color: tk.text, fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box',
  }
  const th: React.CSSProperties = {
    padding: '10px 14px', color: tk.textDim, fontSize: '11px', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left',
    background: tk.tableHead, borderBottom: `1px solid ${tk.border}`, whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    padding: '11px 14px', borderBottom: `1px solid ${tk.tableRow}`, fontSize: '13px',
    color: tk.textMuted, verticalAlign: 'middle',
  }

  const cairoCount = users.filter(u => u.team === 'Cairo' && u.is_active !== false).length
  const indiaCount = users.filter(u => u.team === 'India' && u.is_active !== false).length
  const inactiveCount = users.filter(u => u.is_active === false).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '12px' }}>
        {[
          { label: 'Total Users',    value: users.length,    color: tk.text,    icon: '👥' },
          { label: 'Cairo Active',   value: cairoCount,      color: '#f97316', icon: '🟠' },
          { label: 'India Active',   value: indiaCount,      color: '#3b82f6', icon: '🔵' },
          { label: 'Deactivated',    value: inactiveCount,   color: tk.textDim, icon: '🔒' },
        ].map(k => (
          <div key={k.label} style={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: tk.textDim, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</span>
              <span>{k.icon}</span>
            </div>
            <div style={{ color: k.color, fontSize: '24px', fontWeight: 700 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Message banner */}
      {msg && (
        <div style={{ background: msg.type==='ok'?'#052e16':'#450a0a', border:`1px solid ${msg.type==='ok'?'#166534':'#7f1d1d'}`,
          borderRadius:'10px', padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ color: msg.type==='ok'?'#86efac':'#fca5a5', fontSize:'13px' }}>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={{ background:'none', border:'none', color:tk.textDim, cursor:'pointer', fontSize:'18px' }}>×</button>
        </div>
      )}

      {/* User table */}
      <div style={{ background: tk.bg, border: `1px solid ${tk.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${tk.border}`, background: tk.bgCard,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: tk.text, fontWeight: 600, margin: 0, fontSize: '14px' }}>
            Team Members ({users.length})
          </h3>
          <button onClick={loadUsers} disabled={loading}
            style={{ background: tk.bgInput, border: `1px solid ${tk.border}`, color: tk.textMuted,
              padding: '5px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px',
              display: 'flex', alignItems: 'center', gap: '5px', opacity: loading ? 0.5 : 1 }}>
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Team</th>
                <th style={th}>Role</th>
                <th style={th}>Status</th>
                <th style={th}>Joined</th>
                <th style={{ ...th, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} style={td}><div style={{ height: '14px', background: tk.tableHead, borderRadius: '4px' }} /></td>
                  ))}</tr>
                ))
              ) : users.map(u => {
                const isActive  = u.is_active !== false
                const isBusy    = saving === u.id
                const isSelf    = u.id === profile.id

                return (
                  <tr key={u.id} style={{ opacity: isActive ? 1 : 0.5 }}
                    onMouseEnter={e => (e.currentTarget.style.background = tk.rowHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                    <td style={{ ...td, color: tk.text, fontWeight: 600 }}>{u.full_name || '—'}</td>
                    <td style={{ ...td, color: tk.textMuted, fontSize: '12px' }}>{u.email}</td>

                    {/* Team selector */}
                    <td style={td}>
                      <select
                        value={u.team}
                        disabled={isBusy || isSelf}
                        onChange={e => updateUser(u.id, { team: e.target.value as Team })}
                        style={{ background: tk.bgInput, border: `1px solid ${tk.borderLight}`, borderRadius: '6px',
                          padding: '4px 8px', color: u.team==='Cairo'?'#f97316':u.team==='India'?'#3b82f6':'#a855f7',
                          fontSize: '12px', fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
                        <option value="Cairo">Cairo</option>
                        <option value="India">India</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </td>

                    {/* Role selector */}
                    <td style={td}>
                      <select
                        value={u.role}
                        disabled={isBusy || isSelf}
                        onChange={e => updateUser(u.id, { role: e.target.value as Role })}
                        style={{ background: tk.bgInput, border: `1px solid ${tk.borderLight}`, borderRadius: '6px',
                          padding: '4px 8px', color: tk.textMuted, fontSize: '12px', cursor: 'pointer', outline: 'none' }}>
                        <option value="operator">Operator</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>

                    {/* Active status */}
                    <td style={td}>
                      <span style={{ background: isActive?'#052e16':'#1c1917', border:`1px solid ${isActive?'#166534':'#44403c'}`,
                        color: isActive?'#86efac':tk.textMuted, fontSize:'11px', fontWeight:600,
                        padding:'3px 10px', borderRadius:'99px' }}>
                        {isActive ? '✓ Active' : '🔒 Deactivated'}
                      </span>
                    </td>

                    {/* Joined */}
                    <td style={{ ...td, color: tk.textDim, fontSize: '11px', whiteSpace: 'nowrap' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' }) : '—'}
                    </td>

                    {/* Actions */}
                    <td style={{ ...td, textAlign: 'center' }}>
                      {isSelf ? (
                        <span style={{ color: tk.textFaint, fontSize: '11px', fontStyle: 'italic' }}>You</span>
                      ) : (
                        <button
                          onClick={() => updateUser(u.id, { is_active: !isActive })}
                          disabled={isBusy}
                          style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                            fontSize: '12px', fontWeight: 600, opacity: isBusy ? 0.5 : 1,
                            background: isActive ? '#7f1d1d' : '#14532d',
                            color: isActive ? '#fca5a5' : '#86efac' }}>
                          {isBusy ? '…' : isActive ? '🔒 Deactivate' : '✓ Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create new user */}
      <div style={{ background: tk.bgCard, border: `1px solid ${tk.border}`, borderRadius: '12px', padding: '20px' }}>
        <h3 style={{ color: tk.text, fontWeight: 600, margin: '0 0 18px', fontSize: '14px' }}>➕ Create New User</h3>
        <form onSubmit={createUser} autoComplete="off">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', color: tk.textMuted, fontSize: '11px', fontWeight: 600, marginBottom: '5px', textTransform: 'uppercase' }}>Full Name</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                required placeholder="John Smith" autoComplete="off" style={inp} />
            </div>
            <div>
              <label style={{ display: 'block', color: tk.textMuted, fontSize: '11px', fontWeight: 600, marginBottom: '5px', textTransform: 'uppercase' }}>Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required placeholder="user@hudl.com" autoComplete="new-email" style={inp} />
            </div>
            <div>
              <label style={{ display: 'block', color: tk.textMuted, fontSize: '11px', fontWeight: 600, marginBottom: '5px', textTransform: 'uppercase' }}>Password</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required minLength={8} placeholder="Min 8 characters" autoComplete="new-password" style={inp} />
            </div>
            <div>
              <label style={{ display: 'block', color: tk.textMuted, fontSize: '11px', fontWeight: 600, marginBottom: '5px', textTransform: 'uppercase' }}>Team</label>
              <select value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value as Team }))} style={inp}>
                <option value="Cairo">Cairo</option>
                <option value="India">India</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: tk.textMuted, fontSize: '11px', fontWeight: 600, marginBottom: '5px', textTransform: 'uppercase' }}>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'operator' | 'admin' }))} style={inp}>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={creating}
            style={{ background: '#f97316', color: tk.text, fontWeight: 600, fontSize: '13px',
              padding: '9px 22px', borderRadius: '8px', border: 'none', cursor: 'pointer', opacity: creating ? 0.6 : 1 }}>
            {creating ? 'Creating…' : 'Create User'}
          </button>
        </form>
      </div>
    </div>
  )
}
