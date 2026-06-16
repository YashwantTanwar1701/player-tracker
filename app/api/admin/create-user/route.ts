import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Admins only' }, { status: 403 })

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const body = await req.json()
    const { email, password, full_name, team, role } = body

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (authErr) throw new Error(authErr.message)

    const { data: newProfile, error: profileErr } = await admin
      .from('user_profiles')
      .insert({ id: authData.user.id, email, full_name, team, role })
      .select().single()
    if (profileErr) throw new Error(profileErr.message)

    return NextResponse.json({ user: newProfile })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
