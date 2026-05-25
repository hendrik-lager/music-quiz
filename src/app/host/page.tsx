'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { SpielZustand } from '@/shared/types'
import { STANDARD_KONFIG } from '@/shared/constants'
import { spreche } from '@/lib/tts'

let socket: Socket | null = null

function holeOderErstelleSocket(): Socket {
  if (!socket || !socket.connected) {
    socket = io('/spiel', { transports: ['websocket', 'polling'] })
  }
  return socket
}

interface PlaylistInfo {
  slug: string
  name: string
  anzahlLieder: number
  tags: string[]
}

interface SpielKonfig {
  schwierigkeit: 'leicht' | 'normal' | 'schwer'
  runden: number
  rundenDauer: number
  autoWeiterDelay: number
  künstlerChallenge: boolean
  filmQuiz: boolean
  introModus: boolean
  nächsterGewinntModus: boolean
  playlist: string
  tts: Record<string, boolean>
}

// ─── Setup-Ansicht ────────────────────────────────────────────────────────────

function SpielSetup({
  onSpielErstellen,
  lade,
  fehler,
  playlisten,
  spotifyVerbunden,
}: {
  onSpielErstellen: (konfig: SpielKonfig) => void
  lade: boolean
  fehler: string | null
  playlisten: PlaylistInfo[]
  spotifyVerbunden: boolean
}) {
  const [konfig, setKonfig] = useState<SpielKonfig>({
    ...STANDARD_KONFIG,
    playlist: '',
    tts: { aktiviert: true },
  } as SpielKonfig)

  const setze = <K extends keyof SpielKonfig>(key: K, value: SpielKonfig[K]) => {
    setKonfig(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSpielErstellen(konfig)
  }

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
      <div className="pt-8 mb-8">
        <div className="text-5xl mb-3">🎮</div>
        <h1 className="text-3xl font-bold">Spielleiter</h1>
        <p className="text-white/60 mt-1">Erstelle ein neues Spiel und lade Spieler ein</p>
      </div>

      {!spotifyVerbunden && (
        <div className="card p-4 mb-6 border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎵</span>
            <div className="flex-1">
              <div className="font-medium text-yellow-400">Spotify nicht verbunden</div>
              <div className="text-sm text-white/60">Verbinde Spotify um Musik zu spielen</div>
            </div>
            <a href="/api/auth/spotify" className="btn-primary py-2 px-4 text-sm">
              Verbinden
            </a>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Playlist */}
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Playlist</h2>
          {playlisten.length === 0 ? (
            <div className="text-white/40 text-sm">Playlisten werden geladen...</div>
          ) : (
            <div className="grid gap-2 max-h-60 overflow-y-auto">
              {playlisten.map(pl => (
                <label
                  key={pl.slug}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                    konfig.playlist === pl.slug
                      ? 'border-brand-500/50 bg-brand-500/10'
                      : 'border-white/5 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="playlist"
                    value={pl.slug}
                    checked={konfig.playlist === pl.slug}
                    onChange={() => setze('playlist', pl.slug)}
                    className="hidden"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{pl.name}</div>
                    <div className="text-xs text-white/40">{pl.anzahlLieder} Lieder · {pl.tags.slice(0, 3).join(', ')}</div>
                  </div>
                  {konfig.playlist === pl.slug && <span className="text-brand-400">✓</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Grundeinstellungen */}
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Einstellungen</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-white/60 block mb-1">Schwierigkeit</label>
              <select
                value={konfig.schwierigkeit}
                onChange={e => setze('schwierigkeit', e.target.value as SpielKonfig['schwierigkeit'])}
                className="input text-sm"
              >
                <option value="leicht">Leicht</option>
                <option value="normal">Normal</option>
                <option value="schwer">Schwer</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-white/60 block mb-1">Runden: {konfig.runden}</label>
              <input
                type="range"
                min={3}
                max={25}
                value={konfig.runden}
                onChange={e => setze('runden', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm text-white/60 block mb-1">Zeit/Runde: {konfig.rundenDauer}s</label>
              <input
                type="range"
                min={15}
                max={60}
                step={5}
                value={konfig.rundenDauer}
                onChange={e => setze('rundenDauer', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm text-white/60 block mb-1">Auto-Weiter</label>
              <select
                value={konfig.autoWeiterDelay}
                onChange={e => setze('autoWeiterDelay', parseInt(e.target.value))}
                className="input text-sm"
              >
                <option value={0}>Manuell</option>
                <option value={5}>5 Sekunden</option>
                <option value={10}>10 Sekunden</option>
                <option value={15}>15 Sekunden</option>
              </select>
            </div>
          </div>
        </div>

        {/* Spielmodi */}
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Spielmodi</h2>
          <div className="space-y-3">
            {[
              { key: 'künstlerChallenge', label: 'Künstler-Challenge', desc: 'Erkenne den Künstler (+5 Pkt.)' },
              { key: 'filmQuiz', label: 'Film-Quiz', desc: '~20% der Runden haben eine Film-Frage' },
              { key: 'introModus', label: 'Intro-Modus', desc: '~20% der Runden nur Intro-Ausschnitt' },
              { key: 'nächsterGewinntModus', label: 'Nächster gewinnt', desc: 'Nur der nächste Tipp bekommt Punkte' },
            ].map(({ key, label, desc }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setze(key as keyof SpielKonfig, !konfig[key as keyof SpielKonfig] as SpielKonfig[keyof SpielKonfig])}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    konfig[key as keyof SpielKonfig] ? 'bg-brand-500' : 'bg-white/20'
                  }`}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    konfig[key as keyof SpielKonfig] ? 'translate-x-5' : ''
                  }`} />
                </div>
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-white/40">{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {fehler && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
            {fehler}
          </div>
        )}

        <button
          type="submit"
          disabled={lade || !konfig.playlist}
          className="btn-primary w-full text-lg py-4"
        >
          {lade ? 'Erstelle Spiel...' : 'Spiel erstellen'}
        </button>
      </form>
    </div>
  )
}

// ─── Spiel-Steuerung ──────────────────────────────────────────────────────────

function SpielSteuerung({
  zustand,
  onAktion,
  lautstaerke,
  onLautstaerke,
}: {
  zustand: SpielZustand
  onAktion: (aktion: string, daten?: Record<string, unknown>) => void
  lautstaerke: number
  onLautstaerke: (wert: number) => void
}) {
  const spieler = Object.values(zustand.spieler)
  const verbundene = spieler.filter(sp => sp.verbunden)
  const abgegebene = spieler.filter(sp => sp.hatAbgegeben && !sp.istHost).length
  const gesamte = spieler.filter(sp => !sp.istHost).length
  const beitrittsUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/spielen?spiel=${zustand.spielId}`
    : ''

  return (
    <div className="min-h-screen flex flex-col lg:flex-row gap-4 p-4 max-w-7xl mx-auto">
      {/* Linke Spalte */}
      <div className="flex-1 space-y-4">
        {/* Spiel-ID & QR */}
        <div className="card p-6 text-center">
          <div className="text-sm text-white/60 mb-1">Spieler beitreten lassen:</div>
          <div className="text-5xl font-black text-brand-400 tracking-widest mb-2">{zustand.spielId}</div>
          <div className="text-sm text-white/40">{beitrittsUrl}</div>
          <button
            onClick={() => navigator.clipboard?.writeText(beitrittsUrl)}
            className="btn-secondary text-sm py-2 px-4 mt-3"
          >
            Link kopieren
          </button>
        </div>

        {/* Steuerung */}
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Spielsteuerung</h2>
          <div className="text-sm text-white/60 mb-3">
            Phase: <span className="text-white font-medium">{zustand.phase}</span>
            {zustand.runde && (
              <> · Runde <span className="text-white">{zustand.runde}/{zustand.gesamtRunden}</span></>
            )}
          </div>

          {zustand.phase === 'LOBBY' && (
            <button
              onClick={() => onAktion('spiel_starten')}
              disabled={verbundene.length < 1}
              className="btn-primary w-full"
            >
              ▶ Spiel starten ({verbundene.length} Spieler)
            </button>
          )}

          {zustand.phase === 'SPIELEN' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => onAktion('runde_beenden')}
                  className="btn-secondary flex-1"
                >
                  ⏭ Runde beenden
                </button>
              </div>
              <div className="text-sm text-white/60 text-center">
                {abgegebene}/{gesamte} Abgaben
              </div>
            </div>
          )}

          {zustand.phase === 'AUFDECKEN' && (
            <div className="space-y-2">
              <button
                onClick={() => onAktion('naechste_runde')}
                className="btn-primary w-full"
              >
                ▶ Nächste Runde
              </button>
            </div>
          )}

          {zustand.phase === 'ENDE' && (
            <div className="text-center text-white/60 text-sm">
              Spiel beendet!
            </div>
          )}
        </div>

        {/* Spotify */}
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Musik</h2>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-white/60 text-sm">Lautstärke</span>
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={lautstaerke}
              onChange={e => onLautstaerke(parseInt(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-white/60 w-10 text-right">{lautstaerke}%</span>
          </div>
          {zustand.lied && (zustand.phase === 'SPIELEN' || zustand.phase === 'AUFDECKEN') && (
            <div className="bg-white/5 rounded-xl p-3">
              <div className="text-sm font-medium">
                {zustand.phase === 'AUFDECKEN' ? `${zustand.lied.artist} – ${zustand.lied.titel}` : '🎵 Läuft...'}
              </div>
              {zustand.phase === 'AUFDECKEN' && zustand.lied.jahr && (
                <div className="text-xs text-white/40 mt-0.5">{zustand.lied.jahr}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Rechte Spalte – Spieler & Rangliste */}
      <div className="lg:w-80 space-y-4">
        {/* Spielerliste */}
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Spieler ({verbundene.length})</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {spieler.map(sp => (
              <div key={sp.name} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sp.verbunden ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="flex-1 text-sm truncate">{sp.name}</span>
                {sp.hatAbgegeben && <span className="text-green-400 text-xs">✓</span>}
                {sp.istHost && <span className="badge bg-brand-500/20 text-brand-400 text-xs">Host</span>}
                <button
                  onClick={() => onAktion('spieler_kicken', { name: sp.name })}
                  className="text-red-400/60 hover:text-red-400 text-xs ml-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Rangliste */}
        {zustand.rangliste && zustand.rangliste.length > 0 && (
          <div className="card p-4">
            <h2 className="font-semibold mb-3">Rangliste</h2>
            <div className="space-y-2">
              {zustand.rangliste.slice(0, 8).map(eintrag => (
                <div key={eintrag.name} className="flex items-center gap-2 text-sm">
                  <span className="text-white/40 w-5 text-right">
                    {eintrag.rang === 1 ? '🥇' : eintrag.rang === 2 ? '🥈' : eintrag.rang === 3 ? '🥉' : `${eintrag.rang}.`}
                  </span>
                  <span className="flex-1 truncate">{eintrag.name}</span>
                  <span className="font-bold text-brand-400">{eintrag.punkte}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Host-Lied-Info */}
        {zustand.hostLied?.jahr && (
          <div className="card p-4 bg-brand-500/5 border-brand-500/20">
            <h2 className="font-semibold text-sm text-brand-400 mb-2">Host-Info (nur für dich)</h2>
            <div className="text-2xl font-black">{zustand.hostLied.jahr}</div>
            {zustand.hostLied.funFaktDe && (
              <div className="text-xs text-white/50 mt-2">{zustand.hostLied.funFaktDe}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function HostSeite() {
  const [adminToken, setAdminToken] = useState('')
  const [tokenGeprüft, setTokenGeprüft] = useState(false)
  const [tokenFehler, setTokenFehler] = useState(false)
  const [spielId, setSpielId] = useState<string | null>(null)
  const [zustand, setZustand] = useState<SpielZustand | null>(null)
  const [lade, setLade] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [playlisten, setPlaylisten] = useState<PlaylistInfo[]>([])
  const [spotifyVerbunden, setSpotifyVerbunden] = useState(false)
  const [lautstaerke, setLautstaerke] = useState(50)

  useEffect(() => {
    const gespeichert = localStorage.getItem('admin_token')
    if (gespeichert) {
      setAdminToken(gespeichert)
      setTokenGeprüft(true)
      ladeSetupDaten(gespeichert)
    }

    const params = new URLSearchParams(window.location.search)
    if (params.get('spotify') === 'verbunden') setSpotifyVerbunden(true)

    fetch('/api/auth/spotify/token')
      .then(r => r.ok && setSpotifyVerbunden(true))
      .catch(() => {})
  }, [])

  const ladeSetupDaten = async (token: string) => {
    try {
      const res = await fetch('/api/admin/playlisten', {
        headers: { 'x-admin-token': token },
      })
      if (res.ok) {
        const daten = await res.json() as { playlisten: PlaylistInfo[] }
        setPlaylisten(daten.playlisten)
      }
    } catch {}
  }

  const handleTokenLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: adminToken }),
    })
    if (res.ok) {
      setTokenGeprüft(true)
      setTokenFehler(false)
      localStorage.setItem('admin_token', adminToken)
      ladeSetupDaten(adminToken)
    } else {
      setTokenFehler(true)
    }
  }

  const handleSpielErstellen = async (konfig: SpielKonfig) => {
    setLade(true)
    setFehler(null)
    try {
      const res = await fetch('/api/spiel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ playlist: konfig.playlist, konfig }),
      })
      const daten = await res.json() as { spielId?: string; fehler?: string }

      if (!res.ok || daten.fehler) {
        setFehler(daten.fehler ?? 'Spiel konnte nicht erstellt werden.')
        return
      }

      const id = daten.spielId!
      setSpielId(id)

      const s = holeOderErstelleSocket()
      s.emit('host_beitreten', { spielId: id, adminToken })

      s.on('zustand', (data: SpielZustand) => setZustand(data))
      s.on('host_verbunden', () => console.log('Host verbunden'))
    } catch (err) {
      setFehler('Netzwerkfehler. Bitte versuche es erneut.')
    } finally {
      setLade(false)
    }
  }

  const handleAktion = useCallback((aktion: string, daten?: Record<string, unknown>) => {
    holeOderErstelleSocket().emit(aktion, daten ?? {})
  }, [])

  const handleLautstaerke = useCallback((wert: number) => {
    setLautstaerke(wert)
    holeOderErstelleSocket().emit('lautstaerke_aendern', { prozent: wert })
  }, [])

  if (!tokenGeprüft) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🎮</div>
            <h1 className="text-2xl font-bold">Spielleiter-Login</h1>
          </div>
          <form onSubmit={handleTokenLogin} className="card p-6 space-y-4">
            <div>
              <label className="text-sm text-white/60 block mb-1.5">Admin-Token</label>
              <input
                type="password"
                value={adminToken}
                onChange={e => setAdminToken(e.target.value)}
                placeholder="Token eingeben..."
                className="input"
                autoFocus
              />
            </div>
            {tokenFehler && (
              <div className="text-red-400 text-sm">Ungültiger Token.</div>
            )}
            <button type="submit" className="btn-primary w-full">
              Anmelden
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (!zustand) {
    return (
      <SpielSetup
        onSpielErstellen={handleSpielErstellen}
        lade={lade}
        fehler={fehler}
        playlisten={playlisten}
        spotifyVerbunden={spotifyVerbunden}
      />
    )
  }

  return (
    <SpielSteuerung
      zustand={zustand}
      onAktion={handleAktion}
      lautstaerke={lautstaerke}
      onLautstaerke={handleLautstaerke}
    />
  )
}
