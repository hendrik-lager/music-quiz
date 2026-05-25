import type { Server } from 'socket.io'
import { GameManager } from './game/GameManager'
import { registrierePlayerHandlers } from './handlers/playerHandlers'
import { registriereHostHandlers } from './handlers/hostHandlers'
import { AnalyticsService } from './analytics/AnalyticsService'

export function setupSocketServer(io: Server): void {
  GameManager.initialisiere(io)
  AnalyticsService.getInstance()

  const spielNs = io.of('/spiel')

  spielNs.on('connection', (socket) => {
    console.log(`[Socket] Verbunden: ${socket.id}`)

    registrierePlayerHandlers(socket)
    registriereHostHandlers(socket)

    socket.on('disconnect', () => {
      console.log(`[Socket] Getrennt: ${socket.id}`)
      if (socket.data.spielId) {
        const spiel = GameManager.getInstance().holeSpiel(socket.data.spielId)
        if (spiel) {
          spiel.spielerTrennen(socket.id)
        }
      }
    })

    socket.on('error', (err) => {
      console.error(`[Socket] Fehler ${socket.id}:`, err)
    })
  })

  console.log('[Socket] Server initialisiert auf Namespace /spiel')
}
