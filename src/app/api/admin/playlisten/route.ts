import { NextRequest, NextResponse } from 'next/server'
import { ladePlaylists, holePlaylistListe } from '@/server/game/PlaylistLoader'

function prüfeToken(request: NextRequest): boolean {
  const token = request.headers.get('x-admin-token') ?? request.cookies.get('admin_token')?.value
  return token === process.env.ADMIN_TOKEN
}

export async function GET(request: NextRequest) {
  if (!prüfeToken(request)) {
    return NextResponse.json({ fehler: 'Nicht autorisiert' }, { status: 401 })
  }

  const liste = await holePlaylistListe()
  return NextResponse.json({ playlisten: liste })
}
