import type { Socket } from 'socket.io'
import { GameManager } from '../game/GameManager'
import { SpotifyAuth } from '../spotify/SpotifyAuth'

export function registriereHostHandlers(socket: Socket): void {
  socket.on('host_beitreten', async (daten: { spielId: unknown; adminToken: unknown }) => {
    const erwartetesToken = process.env.ADMIN_TOKEN
    if (!erwartetesToken || daten.adminToken !== erwartetesToken) {
      socket.emit('fehler', { code: 'UNGÜLTIGES_TOKEN', nachricht: 'Ungültiger Admin-Token.' })
      return
    }

    if (typeof daten.spielId !== 'string') return
    const spielId = daten.spielId.toUpperCase()
    const spiel = GameManager.getInstance().holeSpiel(spielId)

    if (!spiel) {
      socket.emit('fehler', { code: 'SPIEL_NICHT_GEFUNDEN', nachricht: `Spiel ${spielId} nicht gefunden.` })
      return
    }

    await socket.join(spielId)
    socket.data.spielId = spielId
    socket.data.istHost = true
    socket.emit('host_verbunden', { spielId })
    spiel.spielerEinladen(socket.id)
  })

  socket.on('spiel_starten', () => {
    const spiel = getSpiel(socket)
    if (!spiel) return

    const ergebnis = spiel.spielStarten()
    if (!ergebnis.erfolg) {
      socket.emit('fehler', { code: ergebnis.fehler, nachricht: 'Spiel konnte nicht gestartet werden.' })
    }
  })

  socket.on('runde_starten', () => {
    const spiel = getSpiel(socket)
    if (!spiel) return
    spiel.rundeStarten()
  })

  socket.on('runde_beenden', () => {
    const spiel = getSpiel(socket)
    if (!spiel) return
    spiel.rundeBeenden()
  })

  socket.on('naechste_runde', () => {
    const spiel = getSpiel(socket)
    if (!spiel) return
    spiel.weiterNächsteRunde()
  })

  socket.on('spieler_kicken', (daten: { name: unknown }) => {
    const spiel = getSpiel(socket)
    if (!spiel) return
    if (typeof daten.name !== 'string') return
    spiel.spielerKicken(daten.name)
  })

  socket.on('spotify_device_registrieren', (daten: { deviceId: unknown }) => {
    if (typeof daten.deviceId === 'string') {
      SpotifyAuth.getInstance().setzeDeviceId(daten.deviceId)
    }
  })

  socket.on('lautstaerke_aendern', async (daten: { prozent: unknown }) => {
    if (typeof daten.prozent !== 'number') return
    const auth = SpotifyAuth.getInstance()
    const token = await auth.holeAccessToken()
    if (!token) return

    await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.round(daten.prozent)}&device_id=${auth.holeDeviceId()}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    })
  })

  socket.on('zustand_anfordern', () => {
    const spiel = getSpiel(socket)
    if (!spiel) return
    spiel.spielerEinladen(socket.id)
  })
}

function getSpiel(socket: Socket) {
  if (!socket.data.spielId) return null
  return GameManager.getInstance().holeSpiel(socket.data.spielId) ?? null
}
