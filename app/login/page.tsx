'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [step,     setStep]     = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setStep('Signing in…')

    const supabase = createClient()

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setStep('')
      setLoading(false)
      return
    }

    if (!data.session) {
      setError('Login succeeded but no session was created. Please try again.')
      setStep('')
      setLoading(false)
      return
    }

    setStep('Logged in! Redirecting…')

    // Wait briefly for session cookie to be written, then hard navigate
    await new Promise(r => setTimeout(r, 500))
    window.location.href = '/dashboard'
  }

  const inp: React.CSSProperties = {
    width: '100%', background: '#252836', border: '1px solid #374151',
    borderRadius: '8px', padding: '10px 14px', color: '#fff',
    fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0f1117', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '48px' }}>🏒</div>
          <h1 style={{ color: '#fff', fontSize: '22px', fontWeight: 700, margin: '8px 0 4px' }}>
            Player Profile Tracker
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>Hudl Hockey Operations</p>
        </div>

        <div style={{ background: '#1a1d27', borderRadius: '16px',
          border: '1px solid #2e3347', padding: '28px' }}>
          <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 600, margin: '0 0 20px' }}>
            Sign in
          </h2>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: '12px', marginBottom: '5px' }}>
                Email
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="you@hudl.com" style={inp} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: '12px', marginBottom: '5px' }}>
                Password
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••" style={inp} />
            </div>

            {step && (
              <div style={{ background: '#052e16', border: '1px solid #166534',
                borderRadius: '8px', padding: '10px 14px' }}>
                <p style={{ color: '#86efac', fontSize: '12px', margin: 0 }}>✓ {step}</p>
              </div>
            )}

            {error && (
              <div style={{ background: '#450a0a', border: '1px solid #7f1d1d',
                borderRadius: '8px', padding: '10px 14px' }}>
                <p style={{ color: '#fca5a5', fontSize: '13px', margin: 0 }}>⚠️ {error}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ background: '#f97316', color: '#fff', fontWeight: 600,
                fontSize: '14px', padding: '11px', borderRadius: '8px', border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1, marginTop: '4px' }}>
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          {/* Manual fallback link shown after successful login */}
          {step.includes('Redirect') && (
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <p style={{ color: '#6b7280', fontSize: '12px', marginBottom: '8px' }}>
                Not redirected automatically?
              </p>
              <a href="/dashboard"
                style={{ color: '#f97316', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}>
                Click here → Dashboard
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
