import type { Server } from 'socket.io'
import { GameState, type SpielKonfig } from './GameState'
import { ladePlaylists } from './PlaylistLoader'

declare global {
  // eslint-disable-next-line no-var
  var __gameManager: GameManager | undefined
}

function erzeugeSpielId(): string {
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = ''
  for (let i = 0; i < 4; i++) {
    id += zeichen[Math.floor(Math.random() * zeichen.length)]
  }
  return id
}

export class GameManager {
  private spiele = new Map<string, GameState>()
  private io: Server

  constructor(io: Server) {
    this.io = io
    ladePlaylists().catch(console.error)
  }

  static initialisiere(io: Server): GameManager {
    if (!globalThis.__gameManager) {
      globalThis.__gameManager = new GameManager(io)
    }
    return globalThis.__gameManager
  }

  static getInstance(): GameManager {
    if (!globalThis.__gameManager) throw new Error('GameManager nicht initialisiert')
    return globalThis.__gameManager
  }

  async erstelleSpiel(playlistSlug: string, konfig: Record<string, unknown> = {}): Promise<{ spielId: string } | { fehler: string }> {
    const playlists = await ladePlaylists()
    const playlist = playlists.get(playlistSlug)
    if (!playlist) return { fehler: 'PLAYLIST_NICHT_GEFUNDEN' }

    let spielId: string
    do {
      spielId = erzeugeSpielId()
    } while (this.spiele.has(spielId))

    const spiel = new GameState(spielId, this.io, playlist.songs, playlist.name, konfig as Partial<SpielKonfig>)
    this.spiele.set(spielId, spiel)

    setTimeout(() => {
      if (this.spiele.has(spielId) && this.spiele.get(spielId)!.holePhase() === 'LOBBY') {
        console.log(`[GameManager] Spiel ${spielId} nach Timeout entfernt`)
        this.spiele.delete(spielId)
      }
    }, 30 * 60 * 1000)

    console.log(`[GameManager] Neues Spiel: ${spielId} mit Playlist "${playlist.name}"`)
    return { spielId }
  }

  holeSpiel(spielId: string): GameState | undefined {
    return this.spiele.get(spielId.toUpperCase())
  }

  entferneSpiel(spielId: string): void {
    this.spiele.delete(spielId)
    console.log(`[GameManager] Spiel ${spielId} beendet`)
  }

  holeAlleSpiele(): { spielId: string; phase: string; spielerAnzahl: number }[] {
    return [...this.spiele.entries()].map(([id, spiel]) => ({
      spielId: id,
      phase: spiel.holePhase(),
      spielerAnzahl: spiel.holeSpielerAnzahl(),
    }))
  }
}
