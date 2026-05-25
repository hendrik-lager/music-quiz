import { NextRequest, NextResponse } from 'next/server'
import { SpotifyAuth } from '@/server/spotify/SpotifyAuth'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/host?fehler=spotify_abgelehnt', request.url))
  }

  const auth = SpotifyAuth.getInstance()
  const erfolg = await auth.tauschCode(code)

  if (!erfolg) {
    return NextResponse.redirect(new URL('/host?fehler=token_fehler', request.url))
  }

  return NextResponse.redirect(new URL('/host?spotify=verbunden', request.url))
}
