import { NextRequest, NextResponse } from 'next/server'
import { AnalyticsService } from '@/server/analytics/AnalyticsService'

function prüfeToken(request: NextRequest): boolean {
  const token = request.headers.get('x-admin-token') ?? request.cookies.get('admin_token')?.value
  return token === process.env.ADMIN_TOKEN
}

export async function GET(request: NextRequest) {
  if (!prüfeToken(request)) {
    return NextResponse.json({ fehler: 'Nicht autorisiert' }, { status: 401 })
  }

  const service = AnalyticsService.getInstance()
  const verlauf = service.holeSpielVerlauf(50)
  const schwierig = service.holeSchwierigsteLieder(10)
  const gesamt = service.holeGesamtStatistiken()

  return NextResponse.json({ verlauf, schwierig, gesamt })
}
