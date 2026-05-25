import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const body = await request.json() as { token: unknown }

  if (typeof body.token !== 'string' || body.token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ fehler: 'Ungültiger Token' }, { status: 401 })
  }

  const cookieStore = await cookies()
  cookieStore.set('admin_token', body.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return NextResponse.json({ erfolg: true })
}
