import type { Socket } from 'socket.io'
import { GameManager } from '../game/GameManager'
import { JAHR_MIN, JAHR_MAX, MAX_NAMEN_LÄNGE } from '../../shared/constants'

function validiereJahr(jahr: unknown): jahr is number {
  return typeof jahr === 'number' && jahr >= JAHR_MIN && jahr <= JAHR_MAX
}

function validiereNamen(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= MAX_NAMEN_LÄNGE
}

export function registrierePlayerHandlers(socket: Socket): void {
  socket.on('beitreten', async (daten: { name: unknown; spielId: unknown; sessionId?: unknown }) => {
    if (!validiereNamen(daten.name) || typeof daten.spielId !== 'string') {
      socket.emit('fehler', { code: 'UNGÜLTIGE_DATEN', nachricht: 'Ungültige Eingabe.' })
      return
    }

    const name = (daten.name as string).trim()
    const spielId = daten.spielId.toUpperCase()
    const spiel = GameManager.getInstance().holeSpiel(spielId)

    if (!spiel) {
      socket.emit('fehler', { code: 'SPIEL_NICHT_GEFUNDEN', nachricht: `Spiel ${spielId} nicht gefunden.` })
      return
    }

    if (daten.sessionId && typeof daten.sessionId === 'string') {
      const ergebnis = spiel.spielerWiederbeitreten(daten.sessionId, socket.id)
      if (ergebnis.erfolg && ergebnis.spieler) {
        await socket.join(spielId)
        socket.data.spielId = spielId
        socket.data.spielerName = ergebnis.spieler.name
        socket.emit('beitritt_bestaetigt', {
          sessionId: ergebnis.spieler.sessionId,
          spielerName: ergebnis.spieler.name,
          spielId,
        })
        spiel.spielerEinladen(socket.id)
        return
      }
    }

    const ergebnis = spiel.spielerBeitreten(name, socket.id)
    if (!ergebnis.erfolg) {
      socket.emit('fehler', { code: ergebnis.fehler, nachricht: `Beitritt fehlgeschlagen: ${ergebnis.fehler}` })
      return
    }

    await socket.join(spielId)
    socket.data.spielId = spielId
    socket.data.spielerName = ergebnis.spieler!.name
    socket.emit('beitritt_bestaetigt', {
      sessionId: ergebnis.spieler!.sessionId,
      spielerName: ergebnis.spieler!.name,
      spielId,
    })
  })

  socket.on('schoetzung_abgeben', (daten: { jahr: unknown; wette?: unknown }) => {
    const spiel = getSpiel(socket)
    if (!spiel || !socket.data.spielerName) return

    if (!validiereJahr(daten.jahr)) {
      socket.emit('fehler', { code: 'UNGÜLTIGES_JAHR', nachricht: 'Ungültiges Jahr.' })
      return
    }

    const ergebnis = spiel.schätzungAbgeben(socket.data.spielerName, daten.jahr, !!daten.wette)
    if (!ergebnis.erfolg) {
      socket.emit('fehler', { code: ergebnis.fehler, nachricht: 'Abgabe fehlgeschlagen.' })
    }
  })

  socket.on('stehlen', (daten: { zielName: unknown }) => {
    const spiel = getSpiel(socket)
    if (!spiel || !socket.data.spielerName) return

    if (typeof daten.zielName !== 'string') return

    const ergebnis = spiel.stehlen(socket.data.spielerName, daten.zielName)
    if (!ergebnis.erfolg) {
      socket.emit('fehler', { code: ergebnis.fehler, nachricht: 'Stehlen fehlgeschlagen.' })
    }
  })

  socket.on('kuenstler_raten', (daten: { artist: unknown }) => {
    const spiel = getSpiel(socket)
    if (!spiel || !socket.data.spielerName) return
    if (typeof daten.artist !== 'string') return

    const ergebnis = spiel.künstlerRaten(socket.data.spielerName, daten.artist)
    socket.emit('kuenstler_antwort', ergebnis)
  })

  socket.on('film_raten', (daten: { film: unknown }) => {
    const spiel = getSpiel(socket)
    if (!spiel || !socket.data.spielerName) return
    if (typeof daten.film !== 'string') return

    const ergebnis = spiel.filmRaten(socket.data.spielerName, daten.film)
    socket.emit('film_antwort', ergebnis)
  })

  socket.on('reaktion', (daten: { emoji: unknown }) => {
    const spiel = getSpiel(socket)
    if (!spiel || !socket.data.spielerName) return
    if (typeof daten.emoji !== 'string') return

    socket.to(socket.data.spielId).emit('spieler_reaktion', {
      spielerName: socket.data.spielerName,
      emoji: daten.emoji,
    })
  })

  socket.on('zustand_anfordern', () => {
    const spiel = getSpiel(socket)
    if (!spiel) return
    spiel.spielerEinladen(socket.id)
  })

  socket.on('ping', () => {
    socket.emit('pong')
  })
}

function getSpiel(socket: Socket) {
  if (!socket.data.spielId) return null
  return GameManager.getInstance().holeSpiel(socket.data.spielId) ?? null
}
