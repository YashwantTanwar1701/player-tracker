import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hockey Player Profile Tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0f1117', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
