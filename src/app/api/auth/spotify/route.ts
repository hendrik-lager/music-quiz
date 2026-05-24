import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'
import { SpotifyAuth } from '@/server/spotify/SpotifyAuth'

export function GET(request: NextRequest) {
  const state = crypto.randomUUID()
  const auth = SpotifyAuth.getInstance()
  const url = auth.holeAuthUrl(state)
  redirect(url)
}
