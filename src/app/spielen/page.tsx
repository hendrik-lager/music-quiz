'use client'

import { useEffect, useState, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { SpielZustand } from '@/shared/types'
import { JAHR_MIN, JAHR_MAX, REAKTIONEN } from '@/shared/constants'
import { spreche } from '@/lib/tts'

let socket: Socket | null = null

function holeOderErstelleSocket(): Socket {
  if (!socket || !socket.connected) {
    socket = io('/spiel', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
    })
  }
  return socket
}

// ─── Subkomponenten ───────────────────────────────────────────────────────────

function Beitrittsformular({
  onBeitreten,
  lade,
  fehler,
}: {
  onBeitreten: (name: string, spielId: string) => void
  lade: boolean
  fehler: string | null
}) {
  const [name, setName] = useState('')
  const [spielId, setSpielId] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onBeitreten(name.trim(), spielId.trim().toUpperCase())
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('spiel')
    if (id) setSpielId(id.toUpperCase())
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎵</div>
          <h1 className="text-4xl font-bold text-gradient">Music Quiz</h1>
          <p className="text-white/60 mt-2">Rate das Erscheinungsjahr des Songs!</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">Dein Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Name eingeben..."
              maxLength={20}
              className="input"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">Spiel-ID</label>
            <input
              type="text"
              value={spielId}
              onChange={e => setSpielId(e.target.value.toUpperCase())}
              placeholder="z.B. AB12"
              maxLength={4}
              className="input tracking-widest text-center text-xl font-bold"
              required
            />
          </div>

          {fehler && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
              {fehler}
            </div>
          )}

          <button
            type="submit"
            disabled={lade || name.trim().length === 0 || spielId.trim().length !== 4}
            className="btn-primary w-full"
          >
            {lade ? 'Verbinde...' : 'Beitreten'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Lobby({ zustand, eigenerName }: { zustand: SpielZustand; eigenerName: string }) {
  const spieler = Object.values(zustand.spieler)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎵</div>
          <h1 className="text-2xl font-bold">Spiellobby</h1>
          <div className="mt-2 bg-brand-500/20 border border-brand-500/30 rounded-xl px-4 py-2 inline-block">
            <span className="text-white/60 text-sm">Spiel-ID: </span>
            <span className="text-brand-400 font-bold text-xl tracking-widest">{zustand.spielId}</span>
          </div>
        </div>

        <div className="card p-4 mb-4">
          <h2 className="text-sm font-medium text-white/60 mb-3">
            {spieler.length} Spieler dabei
          </h2>
          <div className="space-y-2">
            {spieler.map(sp => (
              <div key={sp.name} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                <div className={`w-2 h-2 rounded-full ${sp.verbunden ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="flex-1">{sp.name}</span>
                {sp.istHost && (
                  <span className="badge bg-brand-500/20 text-brand-400">Host</span>
                )}
                {sp.name === eigenerName && (
                  <span className="badge bg-white/10 text-white/60">Du</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <p className="text-center text-white/60 text-sm">
            Warte auf den Host, um das Spiel zu starten...
          </p>
          <div className="flex justify-center mt-3">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-brand-500 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SpielPhase({
  zustand,
  eigenerName,
  onSchätzung,
  onWette,
  onStehlen,
  onReaktion,
}: {
  zustand: SpielZustand
  eigenerName: string
  onSchätzung: (jahr: number, wette: boolean) => void
  onWette: () => void
  onStehlen: (ziel: string) => void
  onReaktion: (emoji: string) => void
}) {
  const ichSpieler = zustand.spieler[eigenerName]
  const [schätzung, setSchätzung] = useState(1985)
  const [wetteAktiv, setWetteAktiv] = useState(false)
  const [abgegeben, setAbgegeben] = useState(false)
  const [stehlenModus, setStehlenModus] = useState(false)
  const [sekunden, setSekunden] = useState(0)

  useEffect(() => {
    if (ichSpieler) {
      setAbgegeben(ichSpieler.hatAbgegeben)
    }
  }, [ichSpieler?.hatAbgegeben])

  useEffect(() => {
    if (!zustand.frist) return
    const berechne = () => setSekunden(Math.max(0, Math.round((zustand.frist! - Date.now()) / 1000)))
    berechne()
    const id = setInterval(berechne, 250)
    return () => clearInterval(id)
  }, [zustand.frist])

  const handleAbgabe = () => {
    onSchätzung(schätzung, wetteAktiv)
    setAbgegeben(true)
  }

  const timerProzent = zustand.frist
    ? Math.max(0, (zustand.frist - Date.now()) / ((zustand.frist - (zustand.frist - (zustand.gesamtRunden ?? 45) * 1000)) || 1) * 100)
    : 100

  const timerFarbe = sekunden <= 5 ? 'bg-red-500' : sekunden <= 15 ? 'bg-yellow-500' : 'bg-brand-500'

  const andereAbgegeben = Object.values(zustand.spieler)
    .filter(sp => sp.name !== eigenerName && !sp.istHost && sp.hatAbgegeben)
    .map(sp => sp.name)

  return (
    <div className="min-h-screen flex flex-col p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-white/60">
          Runde {zustand.runde ?? 1} / {zustand.gesamtRunden ?? '?'}
        </div>
        {zustand.letzteRunde && (
          <span className="badge bg-yellow-500/20 text-yellow-400">Letzte Runde!</span>
        )}
        <div className="text-right">
          <div className="text-xs text-white/40">Deine Punkte</div>
          <div className="text-xl font-bold text-brand-400">{ichSpieler?.punkte ?? 0}</div>
        </div>
      </div>

      {/* Timer */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-white/60">Zeit</span>
          <span className={sekunden <= 5 ? 'text-red-400 font-bold animate-pulse' : 'text-white/80'}>
            {sekunden}s
          </span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full ${timerFarbe} rounded-full transition-all duration-250`}
            style={{ width: `${Math.max(0, (sekunden / 45) * 100)}%` }}
          />
        </div>
      </div>

      {/* Intro-Runde Hinweis */}
      {zustand.istIntroRunde && (
        <div className="card p-3 mb-4 bg-purple-500/20 border-purple-500/30 text-center">
          <span className="text-purple-300 text-sm">🎤 Intro-Runde – Schnell tippen!</span>
        </div>
      )}

      {/* Serie & Stehlen */}
      <div className="flex gap-2 mb-4">
        {(ichSpieler?.serie ?? 0) > 0 && (
          <div className="flex-1 card p-2 text-center">
            <div className="text-xs text-white/60">Serie</div>
            <div className="text-orange-400 font-bold">🔥 {ichSpieler?.serie}</div>
          </div>
        )}
        {ichSpieler?.stehlenVerfügbar && !ichSpieler.stehlenBenutzt && (
          <button
            onClick={() => setStehlenModus(m => !m)}
            className={`flex-1 card p-2 text-center transition-all ${stehlenModus ? 'border-yellow-500 bg-yellow-500/10' : ''}`}
          >
            <div className="text-xs text-white/60">Power-Up</div>
            <div className="text-yellow-400 font-bold text-sm">🥷 Stehlen</div>
          </button>
        )}
      </div>

      {/* Stehlen-Modal */}
      {stehlenModus && andereAbgegeben.length > 0 && (
        <div className="card p-4 mb-4 border-yellow-500/30">
          <h3 className="text-sm font-medium mb-2 text-yellow-400">Wessen Tipp stehlen?</h3>
          <div className="flex flex-wrap gap-2">
            {andereAbgegeben.map(name => (
              <button
                key={name}
                onClick={() => { onStehlen(name); setStehlenModus(false); setAbgegeben(true) }}
                className="btn-secondary text-sm py-1 px-3"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Haupt-Schätzung */}
      <div className="card p-6 flex-1 flex flex-col justify-center">
        {!abgegeben ? (
          <>
            <div className="text-center mb-6">
              <div className="text-6xl font-black text-white">{schätzung}</div>
              <div className="text-white/40 text-sm mt-1">Schiebe den Regler zum Jahr</div>
            </div>

            <input
              type="range"
              min={JAHR_MIN}
              max={JAHR_MAX}
              value={schätzung}
              onChange={e => setSchätzung(parseInt(e.target.value))}
              className="w-full mb-2"
            />

            <div className="flex justify-between text-xs text-white/40 mb-6">
              <span>{JAHR_MIN}</span>
              <span>{JAHR_MAX}</span>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setSchätzung(j => Math.max(JAHR_MIN, j - 1))}
                className="btn-secondary flex-1 py-2"
              >
                ← -1
              </button>
              <button
                onClick={() => setSchätzung(j => Math.min(JAHR_MAX, j + 1))}
                className="btn-secondary flex-1 py-2"
              >
                +1 →
              </button>
            </div>

            {/* Wette */}
            <button
              onClick={() => setWetteAktiv(w => !w)}
              className={`mb-3 card p-3 text-center transition-all ${wetteAktiv ? 'border-yellow-500/50 bg-yellow-500/10' : ''}`}
            >
              <div className="text-sm font-medium">
                {wetteAktiv ? '🎰 Wette aktiv! ×3 oder 0' : '🎰 Dreifach oder Nichts?'}
              </div>
              <div className="text-xs text-white/50 mt-0.5">
                {wetteAktiv ? 'Nur exakter Treffer zählt – aber 3× Punkte!' : 'Tippe nochmal um zu wetten'}
              </div>
            </button>

            <button onClick={handleAbgabe} className="btn-primary w-full text-lg">
              Tipp abgeben {wetteAktiv ? '(×3!)' : ''}
            </button>
          </>
        ) : (
          <div className="text-center">
            <div className="text-5xl mb-4">✅</div>
            <div className="text-2xl font-bold">{ichSpieler?.aktuelleSchätzung ?? schätzung}</div>
            <div className="text-white/60 mt-1">Dein Tipp wurde abgegeben</div>
            {ichSpieler?.wette && (
              <div className="mt-2 badge bg-yellow-500/20 text-yellow-400 mx-auto">🎰 Wette aktiv</div>
            )}
            <div className="mt-4 text-sm text-white/40">
              {zustand.abgegebenAnzahl ?? 0} / {Object.values(zustand.spieler).filter(sp => !sp.istHost).length} abgegeben
            </div>
          </div>
        )}
      </div>

      {/* Reaktionen */}
      <div className="flex gap-2 mt-4 justify-center">
        {REAKTIONEN.map(emoji => (
          <button
            key={emoji}
            onClick={() => onReaktion(emoji)}
            className="text-2xl hover:scale-125 transition-transform active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

function Aufdecken({
  zustand,
  eigenerName,
  onKünstlerRaten,
  onFilmRaten,
  onReaktion,
}: {
  zustand: SpielZustand
  eigenerName: string
  onKünstlerRaten: (artist: string) => void
  onFilmRaten: (film: string) => void
  onReaktion: (emoji: string) => void
}) {
  const ichSpieler = zustand.spieler[eigenerName]
  const [künstlerGeantwortet, setKünstlerGeantwortet] = useState(false)
  const [filmGeantwortet, setFilmGeantwortet] = useState(false)

  const sortierteRangliste = zustand.rangliste ?? []

  return (
    <div className="min-h-screen flex flex-col p-4 max-w-lg mx-auto animate-fade-in">
      {/* Lied-Enthüllung */}
      <div className="card p-6 mb-4 text-center">
        <div className="text-5xl mb-2">{zustand.lied?.jahr ?? '?'}</div>
        <div className="text-lg font-bold">{zustand.lied?.titel}</div>
        <div className="text-white/60">{zustand.lied?.artist}</div>

        {zustand.lied?.funFaktDe && (
          <div className="mt-3 bg-white/5 rounded-xl p-3 text-sm text-white/70 text-left">
            💡 {zustand.lied.funFaktDe}
          </div>
        )}
      </div>

      {/* Meine Punkte */}
      {ichSpieler && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white/60">Dein Ergebnis</div>
              <div className="text-sm">
                {ichSpieler.jahreVorbei === 0 ? (
                  <span className="text-yellow-400 font-bold">🎯 Exakter Treffer!</span>
                ) : ichSpieler.aktuelleSchätzung !== undefined ? (
                  <span>{ichSpieler.aktuelleSchätzung} – {ichSpieler.jahreVorbei} Jahr(e) daneben</span>
                ) : (
                  <span className="text-white/40">Nicht abgegeben</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-black ${(ichSpieler.rundenPunkte ?? 0) > 0 ? 'text-green-400' : 'text-white/40'}`}>
                +{ichSpieler.rundenPunkte ?? 0}
              </div>
              <div className="text-xs text-white/40">Punkte diese Runde</div>
            </div>
          </div>

          {ichSpieler.wette && (
            <div className={`mt-2 text-sm ${ichSpieler.wetteErgebnis === 'gewonnen' ? 'text-yellow-400' : 'text-red-400'}`}>
              {ichSpieler.wetteErgebnis === 'gewonnen' ? '🎰 Wette gewonnen! ×3' : '🎰 Wette verloren'}
            </div>
          )}
        </div>
      )}

      {/* Künstler-Challenge */}
      {zustand.künstlerChallenge && !zustand.künstlerChallenge.gewinner && !künstlerGeantwortet && (
        <div className="card p-4 mb-4 border-purple-500/30 bg-purple-500/5">
          <h3 className="text-sm font-medium text-purple-400 mb-3">🎤 Wer ist der Künstler? (+5 Punkte!)</h3>
          <div className="grid grid-cols-2 gap-2">
            {zustand.künstlerChallenge.optionen.map(opt => (
              <button
                key={opt}
                onClick={() => { onKünstlerRaten(opt); setKünstlerGeantwortet(true) }}
                className="card p-2 text-sm text-center hover:border-purple-500/50 transition-all"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {zustand.künstlerChallenge?.gewinner && (
        <div className="card p-3 mb-4 bg-purple-500/10 text-center text-sm">
          <span className="text-purple-400">🎤 {zustand.künstlerChallenge.gewinner} hat den Künstler erkannt!</span>
        </div>
      )}

      {/* Film-Challenge */}
      {zustand.filmChallenge && !filmGeantwortet && (
        <div className="card p-4 mb-4 border-blue-500/30 bg-blue-500/5">
          <h3 className="text-sm font-medium text-blue-400 mb-3">🎬 Aus welchem Film stammt der Song?</h3>
          <div className="space-y-2">
            {zustand.filmChallenge.optionen.map(film => (
              <button
                key={film}
                onClick={() => { onFilmRaten(film); setFilmGeantwortet(true) }}
                className="card p-2 text-sm w-full text-left hover:border-blue-500/50 transition-all"
              >
                {film}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rangliste */}
      <div className="card p-4 mb-4">
        <h3 className="text-sm font-medium text-white/60 mb-3">Rangliste</h3>
        <div className="space-y-2">
          {sortierteRangliste.slice(0, 5).map(eintrag => (
            <div
              key={eintrag.name}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 ${eintrag.name === eigenerName ? 'bg-brand-500/20 border border-brand-500/30' : 'bg-white/5'}`}
            >
              <span className="text-xl font-bold text-white/40 w-6">
                {eintrag.rang === 1 ? '🥇' : eintrag.rang === 2 ? '🥈' : eintrag.rang === 3 ? '🥉' : eintrag.rang}
              </span>
              <span className="flex-1 text-sm">{eintrag.name}</span>
              <span className="font-bold text-sm">{eintrag.punkte}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reaktionen */}
      <div className="flex gap-2 justify-center">
        {REAKTIONEN.map(emoji => (
          <button
            key={emoji}
            onClick={() => onReaktion(emoji)}
            className="text-2xl hover:scale-125 transition-transform active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

function Ende({ zustand, onNochmal }: { zustand: SpielZustand; onNochmal: () => void }) {
  const rangliste = zustand.rangliste ?? []

  return (
    <div className="min-h-screen flex flex-col items-center p-4 max-w-lg mx-auto animate-fade-in">
      <div className="text-center mb-8 pt-8">
        <div className="text-5xl mb-3">🏆</div>
        <h1 className="text-3xl font-bold">Spiel beendet!</h1>
      </div>

      {/* Podium Top 3 */}
      <div className="flex items-end gap-3 mb-8 justify-center">
        {rangliste.slice(0, 3).map((eintrag, i) => {
          const höhe = i === 0 ? 'h-24' : i === 1 ? 'h-16' : 'h-12'
          const reihenfolge = [1, 0, 2][i]
          const medaille = ['🥇', '🥈', '🥉'][reihenfolge]
          const spieler = rangliste[reihenfolge]
          if (!spieler) return null

          return (
            <div key={spieler.name} className="flex flex-col items-center gap-2">
              <div className="text-3xl">{medaille}</div>
              <div className="text-sm font-medium text-center max-w-20 truncate">{spieler.name}</div>
              <div className="text-xs text-white/60">{spieler.punkte} Pkt.</div>
              <div className={`w-20 ${höhe} bg-brand-500/30 border border-brand-500/50 rounded-t-xl flex items-center justify-center`}>
                <span className="text-white/60 font-bold">{spieler.rang}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Superlative */}
      {zustand.superlative && zustand.superlative.length > 0 && (
        <div className="card p-4 w-full mb-6">
          <h3 className="text-sm font-medium text-white/60 mb-3">Auszeichnungen</h3>
          <div className="space-y-2">
            {zustand.superlative.map(sup => (
              <div key={sup.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                <span className="text-2xl">{sup.emoji}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{sup.spielerName}</div>
                  <div className="text-xs text-white/40">{sup.wert} {sup.wertLabel}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alle Plätze */}
      <div className="card p-4 w-full mb-6">
        <h3 className="text-sm font-medium text-white/60 mb-3">Abschluss-Rangliste</h3>
        <div className="space-y-2">
          {rangliste.map(eintrag => (
            <div key={eintrag.name} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
              <span className="text-white/40 w-6 text-sm">{eintrag.rang}.</span>
              <span className="flex-1 text-sm">{eintrag.name}</span>
              <span className="font-bold text-sm">{eintrag.punkte}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function SpielerSeite() {
  const [socketVerbunden, setSocketVerbunden] = useState(false)
  const [beigetreten, setBeigetreten] = useState(false)
  const [eigenerName, setEigenerName] = useState('')
  const [zustand, setZustand] = useState<SpielZustand | null>(null)
  const [lade, setLade] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [reaktionen, setReaktionen] = useState<{ id: number; name: string; emoji: string }[]>([])
  const reaktionIdRef = React.useRef(0)

  useEffect(() => {
    const s = holeOderErstelleSocket()

    s.on('connect', () => setSocketVerbunden(true))
    s.on('disconnect', () => setSocketVerbunden(false))

    s.on('zustand', (data: SpielZustand) => {
      setZustand(data)
    })

    s.on('beitritt_bestaetigt', (data: { sessionId: string; spielerName: string; spielId: string }) => {
      setEigenerName(data.spielerName)
      setBeigetreten(true)
      setLade(false)
      localStorage.setItem('music_quiz_session', JSON.stringify({
        sessionId: data.sessionId,
        spielerName: data.spielerName,
        spielId: data.spielId,
      }))
    })

    s.on('fehler', (data: { code: string; nachricht: string }) => {
      const meldungen: Record<string, string> = {
        SPIEL_NICHT_GEFUNDEN: 'Spiel nicht gefunden. Prüfe die Spiel-ID.',
        NAME_VERGEBEN: 'Dieser Name ist bereits vergeben.',
        SPIEL_LÄUFT: 'Das Spiel läuft bereits, du kannst nicht mehr beitreten.',
        UNGÜLTIGE_DATEN: 'Bitte gib gültige Daten ein.',
      }
      setFehler(meldungen[data.code] ?? data.nachricht)
      setLade(false)
    })

    s.on('spieler_reaktion', (data: { spielerName: string; emoji: string }) => {
      const id = ++reaktionIdRef.current
      setReaktionen(prev => [...prev, { id, name: data.spielerName, emoji: data.emoji }])
      setTimeout(() => setReaktionen(prev => prev.filter(r => r.id !== id)), 3000)
    })

    if (socketVerbunden) {
      const gespeichert = localStorage.getItem('music_quiz_session')
      if (gespeichert) {
        try {
          const session = JSON.parse(gespeichert) as { sessionId: string; spielerName: string; spielId: string }
          s.emit('beitreten', { name: session.spielerName, spielId: session.spielId, sessionId: session.sessionId })
        } catch {}
      }
    }

    return () => {
      s.off('connect')
      s.off('disconnect')
      s.off('zustand')
      s.off('beitritt_bestaetigt')
      s.off('fehler')
      s.off('spieler_reaktion')
    }
  }, [])

  const handleBeitreten = useCallback((name: string, spielId: string) => {
    if (!name || !spielId || spielId.length !== 4) return
    setFehler(null)
    setLade(true)
    const s = holeOderErstelleSocket()
    s.emit('beitreten', { name, spielId })
  }, [])

  const handleSchätzung = useCallback((jahr: number, wette: boolean) => {
    holeOderErstelleSocket().emit('schoetzung_abgeben', { jahr, wette })
  }, [])

  const handleWette = useCallback(() => {}, [])

  const handleStehlen = useCallback((zielName: string) => {
    holeOderErstelleSocket().emit('stehlen', { zielName })
  }, [])

  const handleReaktion = useCallback((emoji: string) => {
    holeOderErstelleSocket().emit('reaktion', { emoji })
  }, [])

  const handleKünstlerRaten = useCallback((artist: string) => {
    holeOderErstelleSocket().emit('kuenstler_raten', { artist })
  }, [])

  const handleFilmRaten = useCallback((film: string) => {
    holeOderErstelleSocket().emit('film_raten', { film })
  }, [])

  if (!beigetreten) {
    return (
      <Beitrittsformular
        onBeitreten={handleBeitreten}
        lade={lade}
        fehler={fehler}
      />
    )
  }

  if (!zustand) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🎵</div>
          <div className="text-white/60">Verbinde mit dem Spiel...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Reaktionen-Overlay */}
      <div className="fixed inset-0 pointer-events-none z-50">
        {reaktionen.map(r => (
          <div
            key={r.id}
            className="absolute animate-bounce text-4xl"
            style={{
              left: `${20 + Math.random() * 60}%`,
              top: `${20 + Math.random() * 40}%`,
            }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* Verbindungsstatus */}
      {!socketVerbunden && (
        <div className="fixed top-4 right-4 z-50 bg-red-500/20 border border-red-500/30 rounded-lg px-3 py-1.5 text-xs text-red-300">
          Verbindung getrennt...
        </div>
      )}

      {zustand.phase === 'LOBBY' && <Lobby zustand={zustand} eigenerName={eigenerName} />}
      {zustand.phase === 'SPIELEN' && (
        <SpielPhase
          zustand={zustand}
          eigenerName={eigenerName}
          onSchätzung={handleSchätzung}
          onWette={handleWette}
          onStehlen={handleStehlen}
          onReaktion={handleReaktion}
        />
      )}
      {zustand.phase === 'AUFDECKEN' && (
        <Aufdecken
          zustand={zustand}
          eigenerName={eigenerName}
          onKünstlerRaten={handleKünstlerRaten}
          onFilmRaten={handleFilmRaten}
          onReaktion={handleReaktion}
        />
      )}
      {zustand.phase === 'ENDE' && (
        <Ende
          zustand={zustand}
          onNochmal={() => {}}
        />
      )}
    </>
  )
}

// Fix fehlender React-Import für JSX
import React from 'react'
