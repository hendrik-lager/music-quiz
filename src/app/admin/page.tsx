'use client'

import React, { useEffect, useState } from 'react'
import type { SpielRecord } from '@/shared/types'

interface PlaylistInfo {
  slug: string
  name: string
  anzahlLieder: number
  tags: string[]
}

interface GesamtStatistiken {
  gesamtSpiele: number
  gesamtRunden: number
  gesamtSpieler: number
  durchschnittDauer: number
}

interface SchwierigsteLied {
  uri: string
  artist: string
  titel: string
  jahr: number
  durchschnittAbweichung: number
  gespielt: number
}

export default function AdminSeite() {
  const [angemeldet, setAngemeldet] = useState(false)
  const [token, setToken] = useState('')
  const [fehler, setFehler] = useState(false)
  const [aktivTab, setAktivTab] = useState<'dashboard' | 'playlisten' | 'statistiken'>('dashboard')
  const [playlisten, setPlaylisten] = useState<PlaylistInfo[]>([])
  const [verlauf, setVerlauf] = useState<SpielRecord[]>([])
  const [gesamt, setGesamt] = useState<GesamtStatistiken | null>(null)
  const [schwierig, setSchwierig] = useState<SchwierigsteLied[]>([])

  useEffect(() => {
    const gespeichert = localStorage.getItem('admin_token')
    if (gespeichert) {
      setToken(gespeichert)
      prüfeUndLade(gespeichert)
    }
  }, [])

  const prüfeUndLade = async (t: string) => {
    const res = await fetch('/api/admin/playlisten', {
      headers: { 'x-admin-token': t },
    })
    if (res.ok) {
      setAngemeldet(true)
      const daten = await res.json() as { playlisten: PlaylistInfo[] }
      setPlaylisten(daten.playlisten)
      ladeStatistiken(t)
    }
  }

  const ladeStatistiken = async (t: string) => {
    const res = await fetch('/api/admin/statistiken', {
      headers: { 'x-admin-token': t },
    })
    if (res.ok) {
      const daten = await res.json() as {
        verlauf: SpielRecord[]
        gesamt: GesamtStatistiken
        schwierig: SchwierigsteLied[]
      }
      setVerlauf(daten.verlauf)
      setGesamt(daten.gesamt)
      setSchwierig(daten.schwierig)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (res.ok) {
      localStorage.setItem('admin_token', token)
      setFehler(false)
      prüfeUndLade(token)
    } else {
      setFehler(true)
    }
  }

  if (!angemeldet) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🔐</div>
            <h1 className="text-2xl font-bold">Admin-Bereich</h1>
          </div>
          <form onSubmit={handleLogin} className="card p-6 space-y-4">
            <div>
              <label className="text-sm text-white/60 block mb-1.5">Admin-Token</label>
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Token eingeben..."
                className="input"
                autoFocus
              />
            </div>
            {fehler && <div className="text-red-400 text-sm">Ungültiger Token.</div>}
            <button type="submit" className="btn-primary w-full">Anmelden</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/5 bg-surface-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="text-xl font-bold text-gradient">🎵 Music Quiz Admin</div>
          <nav className="flex gap-1 ml-4">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'playlisten', label: 'Playlisten' },
              { id: 'statistiken', label: 'Statistiken' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setAktivTab(tab.id as typeof aktivTab)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  aktivTab === tab.id
                    ? 'bg-brand-500/20 text-brand-400'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex gap-2">
            <a href="/host" className="btn-secondary text-sm py-1.5 px-3">Spielleiter</a>
            <button
              onClick={() => { localStorage.removeItem('admin_token'); setAngemeldet(false) }}
              className="text-white/40 hover:text-white text-sm"
            >
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 py-6">
        {/* Dashboard */}
        {aktivTab === 'dashboard' && (
          <div className="animate-fade-in">
            <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

            {gesamt && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Spiele gesamt', wert: gesamt.gesamtSpiele, icon: '🎮' },
                  { label: 'Runden gespielt', wert: gesamt.gesamtRunden, icon: '🎵' },
                  { label: 'Spieler gesamt', wert: gesamt.gesamtSpieler, icon: '👥' },
                  { label: 'Ø Dauer (Min.)', wert: Math.round(gesamt.durchschnittDauer / 60), icon: '⏱' },
                ].map(karte => (
                  <div key={karte.label} className="card p-4 text-center">
                    <div className="text-3xl mb-1">{karte.icon}</div>
                    <div className="text-2xl font-bold">{karte.wert}</div>
                    <div className="text-sm text-white/60">{karte.label}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="card p-4">
              <h2 className="font-semibold mb-4">Letzte Spiele</h2>
              {verlauf.length === 0 ? (
                <div className="text-white/40 text-sm">Noch keine Spiele aufgezeichnet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-white/40 text-left border-b border-white/5">
                        <th className="pb-2">Datum</th>
                        <th className="pb-2">Playlist</th>
                        <th className="pb-2">Spieler</th>
                        <th className="pb-2">Runden</th>
                        <th className="pb-2">Schwierigkeit</th>
                        <th className="pb-2">Ø Punkte</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {verlauf.slice(0, 10).map(spiel => (
                        <tr key={spiel.spielId} className="hover:bg-white/5">
                          <td className="py-2 text-white/60">
                            {new Date(spiel.beendetUm).toLocaleDateString('de-DE')}
                          </td>
                          <td className="py-2">{spiel.playlist}</td>
                          <td className="py-2">{spiel.spielerAnzahl}</td>
                          <td className="py-2">{spiel.runden}</td>
                          <td className="py-2">{spiel.schwierigkeit}</td>
                          <td className="py-2">{Math.round(spiel.durchschnittsPunkte)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Playlisten */}
        {aktivTab === 'playlisten' && (
          <div className="animate-fade-in">
            <h1 className="text-2xl font-bold mb-6">Playlisten ({playlisten.length})</h1>
            <div className="grid gap-3 md:grid-cols-2">
              {playlisten.map(pl => (
                <div key={pl.slug} className="card p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium">{pl.name}</h3>
                      <div className="text-sm text-white/40 mt-0.5">{pl.anzahlLieder} Lieder</div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {pl.tags.slice(0, 4).map(tag => (
                          <span key={tag} className="badge bg-white/5 text-white/60">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Statistiken */}
        {aktivTab === 'statistiken' && (
          <div className="animate-fade-in">
            <h1 className="text-2xl font-bold mb-6">Statistiken</h1>

            <div className="card p-4">
              <h2 className="font-semibold mb-4">Schwierigste Lieder</h2>
              {schwierig.length === 0 ? (
                <div className="text-white/40 text-sm">Noch nicht genug Daten.</div>
              ) : (
                <div className="space-y-2">
                  {schwierig.map((lied, i) => (
                    <div key={lied.uri} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                      <span className="text-white/40 w-6 text-sm">{i + 1}.</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{lied.artist} – {lied.titel}</div>
                        <div className="text-xs text-white/40">{lied.jahr} · {lied.gespielt}× gespielt</div>
                      </div>
                      <div className="text-right">
                        <div className="text-red-400 font-bold text-sm">Ø {lied.durchschnittAbweichung?.toFixed(1)} J.</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
