import { NextResponse } from 'next/server'
import { SpotifyAuth } from '@/server/spotify/SpotifyAuth'

export async function GET() {
  const auth = SpotifyAuth.getInstance()
  const token = await auth.holeAccessToken()

  if (!token) {
    return NextResponse.json({ fehler: 'Nicht angemeldet' }, { status: 401 })
  }

  return NextResponse.json({ accessToken: token })
}
