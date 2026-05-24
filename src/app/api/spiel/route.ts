import { NextRequest, NextResponse } from 'next/server'
import { GameManager } from '@/server/game/GameManager'
import { STANDARD_KONFIG } from '@/shared/constants'

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ fehler: 'Nicht autorisiert' }, { status: 401 })
  }

  try {
    const body = await request.json() as { playlist: unknown; konfig?: unknown }

    if (typeof body.playlist !== 'string') {
      return NextResponse.json({ fehler: 'Playlist erforderlich' }, { status: 400 })
    }

    const konfig = { ...STANDARD_KONFIG, ...(body.konfig ?? {}) }
    let manager: GameManager
    try {
      manager = GameManager.getInstance()
    } catch {
      return NextResponse.json({ fehler: 'Server nicht bereit. Starte den Spielleiter zuerst.' }, { status: 503 })
    }
    const ergebnis = await manager.erstelleSpiel(body.playlist, konfig)

    if ('fehler' in ergebnis) {
      return NextResponse.json({ fehler: ergebnis.fehler }, { status: 400 })
    }

    return NextResponse.json({ spielId: ergebnis.spielId })
  } catch (err) {
    console.error('[API] Spiel erstellen Fehler:', err)
    return NextResponse.json({ fehler: 'Interner Fehler' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const manager = GameManager.getInstance()
    return NextResponse.json({ spiele: manager.holeAlleSpiele() })
  } catch {
    return NextResponse.json({ spiele: [] })
  }
}
