'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserProfile } from '@/types'
import PlayersList   from '@/components/PlayersList'
import ProfilePicTab from '@/components/ProfilePicTab'
import Tournaments   from '@/components/Tournaments'
import AdminPanel    from '@/components/AdminPanel'
import Overview      from '@/components/Overview'

type Tab = 'overview' | 'players' | 'profilepic' | 'tournaments' | 'admin'
export type Theme = 'dark' | 'light'

// Theme context so child components can read it
export const ThemeContext = createContext<Theme>('dark')
export function useTheme() { return useContext(ThemeContext) }

// Theme tokens — MUST use plain string literals (no tk references at module level)
export const T = {
  dark: {
    bg:          '#0f1117',
    bgCard:      '#1a1d27',
    bgInput:     '#252836',
    border:      '#2e3347',
    borderLight: '#374151',
    text:        '#f1f5f9',
    textMuted:   '#9ca3af',
    textDim:     '#6b7280',
    textFaint:   '#4b5563',
    rowHover:    '#0f1623',
    tableHead:   '#111827',
    tableRow:    '#1a2035',
    navBg:       '#1a1d27',
  },
  light: {
    bg:          '#f0f4f8',
    bgCard:      '#ffffff',
    bgInput:     '#f8fafc',
    border:      '#d1d9e0',
    borderLight: '#b8c2cc',
    text:        '#0f172a',
    textMuted:   '#334155',
    textDim:     '#475569',
    textFaint:   '#64748b',
    rowHover:    '#eef2f7',
    tableHead:   '#e8edf2',
    tableRow:    '#d8e0e8',
    navBg:       '#ffffff',
  },
}

export default function Dashboard() {
  const supabase = createClient()
  const [tab,     setTab]     = useState<Tab>('overview')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [errMsg,  setErrMsg]  = useState('')
  const [theme,   setTheme]   = useState<Theme>('dark')

  // Load saved theme from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('hpt_theme') as Theme | null
    if (saved === 'light' || saved === 'dark') setTheme(saved)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('hpt_theme', next)
  }

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const userId = session?.user?.id
        if (!userId) { window.location.href = '/login'; return }

        const { data: prof, error: profErr } = await supabase
          .from('user_profiles').select('*').eq('id', userId).single()

        if (profErr || !prof) {
          setErrMsg(`Profile not found for user ${userId}. Run the INSERT SQL in Supabase.`)
          setLoading(false)
          return
        }
        setProfile(prof)
        setLoading(false)
      } catch (err: any) {
        setErrMsg('Error: ' + err.message)
        setLoading(false)
      }
    }
    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const tk = T[theme]

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: tk.bg }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏒</div>
          <p style={{ color: tk.textMuted, fontSize: '14px' }}>Loading…</p>
        </div>
      </div>
    )
  }

  if (errMsg) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: tk.bg, padding: '20px' }}>
        <div style={{ background: tk.bgCard, border: '1px solid #7f1d1d',
          borderRadius: '16px', padding: '32px', maxWidth: '500px', width: '100%' }}>
          <h2 style={{ color: '#f87171', margin: '0 0 12px' }}>⚠️ Setup Required</h2>
          <p style={{ color: tk.textMuted, fontSize: '14px', marginBottom: '16px' }}>{errMsg}</p>
          <button onClick={() => window.location.href = '/login'}
            style={{ background: tk.bgInput, border: `1px solid ${tk.border}`, color: tk.text,
              padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
            ← Back to Login
          </button>
        </div>
      </div>
    )
  }

  if (!profile) { window.location.href = '/login'; return null }

  const teamColor = profile.team === 'Cairo' ? '#f97316'
    : profile.team === 'India' ? '#3b82f6' : '#a855f7'

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview',    label: '📊 Overview'   },
    { key: 'players',     label: '👤 Players'     },
    { key: 'profilepic',  label: '📸 Profile Pic' },
    { key: 'tournaments', label: '🏆 Tournaments' },
    ...(profile.role === 'admin' ? [{ key: 'admin' as Tab, label: '⚙️ Admin' }] : []),
  ]

  const wide = tab === 'players' || tab === 'profilepic'

  return (
    <ThemeContext.Provider value={theme}>
      {/* Global background */}
      <div style={{ minHeight: '100vh', background: tk.bg, transition: 'background 0.2s' }}>

        {/* Nav */}
        <nav style={{ background: tk.navBg, borderBottom: `1px solid ${tk.border}`,
          padding: '12px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50,
          transition: 'background 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🏒</span>
            <div>
              <div style={{ color: tk.text, fontWeight: 700, fontSize: '14px' }}>
                Player Profile Tracker
              </div>
              <div style={{ color: tk.textDim, fontSize: '11px' }}>Hudl Hockey Operations</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Theme toggle */}
            <button onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              style={{ background: tk.bgInput, border: `1px solid ${tk.border}`,
                borderRadius: '99px', padding: '5px 12px', cursor: 'pointer',
                fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px',
                color: tk.textMuted, transition: 'all 0.2s' }}>
              {theme === 'dark' ? '☀️' : '🌙'}
              <span style={{ fontSize: '11px', fontWeight: 600 }}>
                {theme === 'dark' ? 'Light' : 'Dark'}
              </span>
            </button>

            <div style={{ textAlign: 'right' }}>
              <div style={{ color: tk.text, fontSize: '13px', fontWeight: 600 }}>
                {profile.full_name || profile.email}
              </div>
              <div style={{ fontSize: '11px' }}>
                <span style={{ color: teamColor, fontWeight: 600 }}>{profile.team}</span>
                <span style={{ color: tk.textDim }}> · {profile.role}</span>
              </div>
            </div>

            <button onClick={signOut}
              style={{ background: tk.bgInput, border: `1px solid ${tk.border}`,
                color: tk.textMuted, padding: '6px 14px', borderRadius: '8px',
                cursor: 'pointer', fontSize: '13px' }}>
              Sign out
            </button>
          </div>
        </nav>

        {/* Tab bar */}
        <div style={{ background: tk.navBg, borderBottom: `1px solid ${tk.border}`,
          padding: '0 24px', display: 'flex', gap: '4px', overflowX: 'auto',
          transition: 'background 0.2s' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500,
                background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                borderBottom: tab === t.key ? '2px solid #f97316' : '2px solid transparent',
                color: tab === t.key ? '#f97316' : tk.textMuted,
                transition: 'color 0.15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Main content */}
        <main style={{ maxWidth: wide ? '100%' : '1200px', margin: '0 auto',
          padding: wide ? '16px' : '24px 16px' }}>
          {tab === 'overview'    && <Overview      profile={profile} />}
          {tab === 'players'     && <PlayersList   profile={profile} />}
          {tab === 'profilepic'  && <ProfilePicTab profile={profile} />}
          {tab === 'tournaments' && <Tournaments   profile={profile} />}
          {tab === 'admin'       && profile.role === 'admin' && <AdminPanel profile={profile} />}
        </main>
      </div>
    </ThemeContext.Provider>
  )
}
