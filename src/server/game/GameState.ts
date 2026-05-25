import type { Server, Socket } from 'socket.io'
import type { SpielZustand, SpielPhase, PlaylistLied, KünstlerChallenge, FilmChallenge, RundenAnalytik } from '../../shared/types'
import { STANDARD_KONFIG, STATE_BROADCAST_DEBOUNCE_MS, KÜNSTLER_BONUS, FILM_BONUS_TABELLEN, STEHLEN_SERIE_SCHWELLE } from '../../shared/constants'
import { PlayerRegistry, type SpielerSession } from './PlayerRegistry'
import { ScoringService } from './ScoringService'
import { mischeLieder, wähleKünstlerOptionen, wähleFilmOptionen } from './PlaylistLoader'
import { AnalyticsService } from '../analytics/AnalyticsService'

export interface SpielKonfig {
  schwierigkeit: 'leicht' | 'normal' | 'schwer'
  runden: number
  rundenDauer: number
  autoWeiterDelay: number
  künstlerChallenge: boolean
  filmQuiz: boolean
  introModus: boolean
  nächsterGewinntModus: boolean
  playlist: string
  playlistName: string
  tts: Record<string, boolean>
}

export class GameState {
  readonly spielId: string
  private io: Server
  private phase: SpielPhase = 'LOBBY'
  private spieler: PlayerRegistry = new PlayerRegistry()
  private scoring: ScoringService = new ScoringService()
  private konfig: SpielKonfig
  private playlist: PlaylistLied[] = []
  private aktuelleRundenIndex = -1
  private aktuellesLied: PlaylistLied | null = null
  private rundenStart: number | null = null
  private rundenTimer: ReturnType<typeof setTimeout> | null = null
  private autoWeiterTimer: ReturnType<typeof setTimeout> | null = null
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null
  private künstlerChallenge: KünstlerChallenge | null = null
  private filmChallenge: FilmChallenge | null = null
  private istIntroRunde = false
  private introSplashAusstehend = false
  private gestartetUm: number | null = null
  private ttsCallbacks: ((text: string) => void)[] = []

  constructor(spielId: string, io: Server, playlist: PlaylistLied[], playlistName: string, konfig: Partial<SpielKonfig> = {}) {
    this.spielId = spielId
    this.io = io
    this.konfig = {
      ...STANDARD_KONFIG,
      playlistName,
      ...konfig,
    } as SpielKonfig
    this.playlist = mischeLieder(playlist).slice(0, this.konfig.runden)
  }

  onTTS(callback: (text: string) => void): void {
    this.ttsCallbacks.push(callback)
  }

  private tts(text: string): void {
    for (const cb of this.ttsCallbacks) cb(text)
  }

  // ---- Spieler-Verwaltung ----

  spielerBeitreten(name: string, socketId: string, istHost = false): { erfolg: boolean; spieler?: SpielerSession; fehler?: string } {
    if (this.spieler.existiert(name)) {
      const vorhandener = this.spieler.holePerName(name)!
      if (vorhandener.verbunden) {
        return { erfolg: false, fehler: 'NAME_VERGEBEN' }
      }
      vorhandener.socketId = socketId
      vorhandener.verbunden = true
      this.sendeBroadcast()
      return { erfolg: true, spieler: vorhandener }
    }

    if (this.phase !== 'LOBBY') {
      return { erfolg: false, fehler: 'SPIEL_LÄUFT' }
    }

    const spieler = this.spieler.erstelle(name, socketId, istHost)
    this.io.of('/spiel').to(this.spielId).emit('spieler_beigetreten', { name })
    this.tts(istHost ? `${name} ist als Spielleiter dabei.` : `${name} ist dem Spiel beigetreten.`)
    this.sendeBroadcast()
    return { erfolg: true, spieler }
  }

  spielerWiederbeitreten(sessionId: string, socketId: string): { erfolg: boolean; spieler?: SpielerSession } {
    const spieler = this.spieler.holePerSession(sessionId)
    if (!spieler) return { erfolg: false }

    spieler.socketId = socketId
    spieler.verbunden = true
    this.tts(`${spieler.name} ist zurück!`)
    this.sendeBroadcast()
    return { erfolg: true, spieler }
  }

  spielerTrennen(socketId: string): void {
    const spieler = this.spieler.holePerSocket(socketId)
    if (!spieler) return

    spieler.verbunden = false
    this.io.of('/spiel').to(this.spielId).emit('spieler_verlassen', { name: spieler.name })
    this.sendeBroadcast()
  }

  spielerKicken(name: string): void {
    this.spieler.entferne(name)
    this.io.of('/spiel').to(this.spielId).emit('spieler_verlassen', { name })
    this.sendeBroadcast()
  }

  // ---- Spielphasen ----

  spielStarten(): { erfolg: boolean; fehler?: string } {
    if (this.phase !== 'LOBBY') return { erfolg: false, fehler: 'FALSHE_PHASE' }
    if (this.playlist.length === 0) return { erfolg: false, fehler: 'KEINE_PLAYLIST' }

    this.phase = 'SPIELEN'
    this.gestartetUm = Date.now()
    this.tts(`Das Spiel beginnt mit ${this.spieler.alle().length} Spielern. Viel Spaß!`)
    this.nächsteRunde()
    return { erfolg: true }
  }

  rundeStarten(): { erfolg: boolean; fehler?: string } {
    if (this.phase !== 'SPIELEN') return { erfolg: false, fehler: 'FALSCHE_PHASE' }
    if (this.istIntroRunde && this.introSplashAusstehend) {
      this.introSplashAusstehend = false
    }
    this.rundenTimer = setTimeout(() => this.rundeAutomatischBeenden(), this.konfig.rundenDauer * 1000)
    this.rundenStart = Date.now()
    this.tts(`Runde ${this.aktuelleRundenIndex + 1} von ${this.konfig.runden}. Los!`)
    this.sendeBroadcast()
    return { erfolg: true }
  }

  private nächsteRunde(): void {
    this.aktuelleRundenIndex++
    if (this.aktuelleRundenIndex >= this.playlist.length) {
      this.spielEnde()
      return
    }

    this.spieler.resetRundenDaten()
    this.aktuellesLied = this.playlist[this.aktuelleRundenIndex]
    this.künstlerChallenge = null
    this.filmChallenge = null
    this.istIntroRunde = this.konfig.introModus && Math.random() < 0.2
    this.introSplashAusstehend = this.istIntroRunde

    if (this.konfig.filmQuiz && this.aktuellesLied.movie && Math.random() < 0.2) {
      const optionen = wähleFilmOptionen(this.aktuellesLied.movie, this.aktuellesLied.movie_choices, this.playlist)
      this.filmChallenge = { optionen, richtigerFilm: this.aktuellesLied.movie }
    }

    if (!this.istIntroRunde) {
      this.rundeStarten()
    } else {
      this.tts(`Intro-Runde! Stoppe den Song sobald du ihn erkennst!`)
      this.sendeBroadcast()
    }
  }

  weiterNächsteRunde(): void {
    if (this.autoWeiterTimer) {
      clearTimeout(this.autoWeiterTimer)
      this.autoWeiterTimer = null
    }
    this.phase = 'SPIELEN'
    this.nächsteRunde()
  }

  schätzungAbgeben(name: string, jahr: number, wette: boolean): { erfolg: boolean; fehler?: string } {
    if (this.phase !== 'SPIELEN') return { erfolg: false, fehler: 'FALSCHE_PHASE' }
    const spieler = this.spieler.holePerName(name)
    if (!spieler || spieler.hatAbgegeben) return { erfolg: false, fehler: 'BEREITS_ABGEGEBEN' }

    spieler.aktuelleSchätzung = jahr
    spieler.abgabeZeit = Date.now()
    spieler.hatAbgegeben = true
    spieler.wette = wette && !spieler.wette

    if (wette) spieler.wettenGesetzt++

    this.prüfeObAlleAbgegeben()
    this.sendeBroadcast()
    return { erfolg: true }
  }

  stehlen(stehlerName: string, zielName: string): { erfolg: boolean; fehler?: string } {
    if (this.phase !== 'SPIELEN') return { erfolg: false, fehler: 'FALSCHE_PHASE' }
    const stehler = this.spieler.holePerName(stehlerName)
    const ziel = this.spieler.holePerName(zielName)

    if (!stehler || !stehler.stehlenVerfügbar || stehler.stehlenBenutzt) return { erfolg: false, fehler: 'NICHT_VERFÜGBAR' }
    if (!ziel || !ziel.hatAbgegeben || ziel.aktuelleSchätzung === null) return { erfolg: false, fehler: 'ZIEL_HAT_NICHT_ABGEGEBEN' }

    stehler.aktuelleSchätzung = ziel.aktuelleSchätzung
    stehler.abgabeZeit = Date.now()
    stehler.hatAbgegeben = true
    stehler.stehlenBenutzt = true
    stehler.stehlenVerfügbar = false
    stehler.hatGestohlenVon = zielName
    ziel.gestohlenVon = stehlerName

    this.prüfeObAlleAbgegeben()
    this.sendeBroadcast()
    return { erfolg: true }
  }

  künstlerRaten(name: string, artist: string): { erfolg: boolean; korrekt: boolean; bonus: number } {
    if (!this.künstlerChallenge || !this.aktuellesLied) return { erfolg: false, korrekt: false, bonus: 0 }
    const spieler = this.spieler.holePerName(name)
    if (!spieler || spieler.hatKünstlerRateEingereicht) return { erfolg: false, korrekt: false, bonus: 0 }

    spieler.hatKünstlerRateEingereicht = true
    const korrekt = artist === this.aktuellesLied.artist

    if (korrekt && !this.künstlerChallenge.gewinner) {
      this.künstlerChallenge.gewinner = name
      spieler.künstlerBonus += KÜNSTLER_BONUS
      spieler.punkte += KÜNSTLER_BONUS
      spieler.künstlerKorrekt++
      this.tts(`${name} kennt den Künstler!`)
    }

    this.sendeBroadcast()
    return { erfolg: true, korrekt, bonus: korrekt && !this.künstlerChallenge.gewinner ? 0 : korrekt ? KÜNSTLER_BONUS : 0 }
  }

  filmRaten(name: string, film: string): { erfolg: boolean; korrekt: boolean; rang: number; bonus: number } {
    if (!this.filmChallenge || !this.filmChallenge.richtigerFilm) return { erfolg: false, korrekt: false, rang: 0, bonus: 0 }
    const spieler = this.spieler.holePerName(name)
    if (!spieler || spieler.hatFilmRateEingereicht) return { erfolg: false, korrekt: false, rang: 0, bonus: 0 }

    spieler.hatFilmRateEingereicht = true
    const korrekt = film === this.filmChallenge.richtigerFilm

    if (korrekt) {
      if (!this.filmChallenge.ergebnisse) {
        this.filmChallenge.ergebnisse = { gewinner: [], falscheAntworten: [] }
      }
      const rang = this.filmChallenge.ergebnisse.gewinner.length + 1
      const bonus = FILM_BONUS_TABELLEN[rang - 1] ?? 0
      this.filmChallenge.ergebnisse.gewinner.push({ name, zeit: Date.now(), bonus })
      spieler.filmBonus += bonus
      spieler.punkte += bonus
      spieler.filmBonusGesamt += bonus
      this.sendeBroadcast()
      return { erfolg: true, korrekt: true, rang, bonus }
    } else {
      if (!this.filmChallenge.ergebnisse) {
        this.filmChallenge.ergebnisse = { gewinner: [], falscheAntworten: [] }
      }
      this.filmChallenge.ergebnisse.falscheAntworten.push({ name, antwort: film })
      this.sendeBroadcast()
      return { erfolg: true, korrekt: false, rang: 0, bonus: 0 }
    }
  }

  private prüfeObAlleAbgegeben(): void {
    const verbundene = this.spieler.alleVerbunden().filter(sp => !sp.istHost)
    const alleAbgegeben = verbundene.length > 0 && verbundene.every(sp => sp.hatAbgegeben)

    if (alleAbgegeben) {
      if (this.rundenTimer) clearTimeout(this.rundenTimer)
      setTimeout(() => this.rundeBeenden(), 500)
    }
  }

  private rundeAutomatischBeenden(): void {
    this.rundeBeenden()
  }

  rundeBeenden(): void {
    if (this.phase !== 'SPIELEN') return
    if (this.rundenTimer) {
      clearTimeout(this.rundenTimer)
      this.rundenTimer = null
    }

    this.phase = 'AUFDECKEN'
    const lied = this.aktuellesLied!
    const ergebnisse = this.scoring.berechneRunde(
      this.spieler.alle().filter(sp => sp.hatAbgegeben),
      lied.year,
      this.konfig.schwierigkeit,
      this.rundenStart!,
      this.konfig.rundenDauer,
      this.konfig.nächsterGewinntModus,
    )

    for (const ergebnis of ergebnisse) {
      const spieler = this.spieler.holePerName(ergebnis.name)!
      spieler.rundenPunkte = ergebnis.rundenPunkte
      spieler.basisPunkte = ergebnis.basisPunkte
      spieler.geschwindigkeitsMultiplikator = ergebnis.geschwindigkeitsMultiplikator
      spieler.serienBonus = ergebnis.serienBonus
      spieler.jahreVorbei = ergebnis.jahreVorbei
      spieler.punkte += ergebnis.rundenPunkte
      spieler.serie = ergebnis.neueSerie
      spieler.besteSerie = Math.max(spieler.besteSerie, ergebnis.neueSerie)

      if (ergebnis.istExakt) {
        spieler.exakteTreffer++
        spieler.stehlenVerfügbar = !spieler.stehlenBenutzt
      } else if (ergebnis.istNah) {
        spieler.naheTreffer++
      }

      if (spieler.wette) {
        spieler.wetteErgebnis = ergebnis.istExakt ? 'gewonnen' : 'verloren'
        if (ergebnis.istExakt) spieler.wettenGewonnen++
      }

      if (ergebnis.rundenPunkte > 0 && spieler.abgabeZeit && this.rundenStart) {
        spieler.abgabeZeiten.push(spieler.abgabeZeit - this.rundenStart)
      }

      spieler.rundenPunkteListe.push(ergebnis.rundenPunkte)
    }

    if (this.konfig.künstlerChallenge) {
      const optionen = wähleKünstlerOptionen(lied.artist, lied.alt_artists ?? [], this.playlist)
      this.künstlerChallenge = { optionen, richtiger: lied.artist }
    }

    const richtigeAntwortText = `Das Lied stammt aus dem Jahr ${lied.year}!`
    this.tts(richtigeAntwortText)

    AnalyticsService.getInstance().zeichneRundeAuf({
      spielId: this.spielId,
      liedUri: lied.uri,
      artist: lied.artist,
      titel: lied.title,
      jahr: lied.year,
      playlist: this.konfig.playlist,
      schwierigkeit: this.konfig.schwierigkeit,
      gesamtSchätzungen: ergebnisse.length,
      exakteTreffer: ergebnisse.filter(e => e.istExakt).length,
      naheTreffer: ergebnisse.filter(e => e.istNah).length,
      gesamtJahreVorbei: ergebnisse.reduce((sum, e) => sum + e.jahreVorbei, 0),
      gespieltUm: Date.now(),
    }).catch(console.error)

    this.sendeBroadcast()

    if (this.konfig.autoWeiterDelay > 0) {
      this.autoWeiterTimer = setTimeout(() => this.weiterNächsteRunde(), this.konfig.autoWeiterDelay * 1000)
    }
  }

  private spielEnde(): void {
    this.phase = 'ENDE'
    const alle = this.spieler.alle()
    const superlative = this.scoring.berechneSuperlative(alle)
    const rangliste = this.scoring.berechneRangliste(alle)

    if (rangliste.length > 0) {
      const sieger = rangliste[0]
      this.tts(`Das Spiel ist beendet! Glückwunsch an ${sieger.name} mit ${sieger.punkte} Punkten!`)
    }

    AnalyticsService.getInstance().zeichneSpielAuf({
      spielId: this.spielId,
      gestartetUm: this.gestartetUm!,
      beendetUm: Date.now(),
      dauerSekunden: Math.round((Date.now() - this.gestartetUm!) / 1000),
      spielerAnzahl: alle.length,
      runden: this.aktuelleRundenIndex + 1,
      durchschnittsPunkte: alle.reduce((sum, sp) => sum + sp.punkte, 0) / (alle.length || 1),
      schwierigkeit: this.konfig.schwierigkeit,
      playlist: this.konfig.playlist,
      gesamtWetten: alle.reduce((sum, sp) => sum + sp.wettenGesetzt, 0),
      wettenGewonnen: alle.reduce((sum, sp) => sum + sp.wettenGewonnen, 0),
      serie3: alle.filter(sp => sp.besteSerie >= 3).length,
      serie5: alle.filter(sp => sp.besteSerie >= 5).length,
      serie10: alle.filter(sp => sp.besteSerie >= 10).length,
    }).catch(console.error)

    this.sendeBroadcast()
  }

  spielerEinladen(socketId: string): void {
    const spieler = this.spieler.holePerSocket(socketId)
    if (spieler) {
      this.io.of('/spiel').to(socketId).emit('zustand', this.erstelleZustand(spieler.name))
    }
  }

  holeHostSocket(): string | null {
    return this.spieler.alle().find(sp => sp.istHost)?.socketId ?? null
  }

  holePhase(): SpielPhase {
    return this.phase
  }

  holeSpielerAnzahl(): number {
    return this.spieler.alle().length
  }

  private sendeBroadcast(): void {
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer)
    this.broadcastTimer = setTimeout(() => {
      const zustand = this.erstelleZustand()
      this.io.of('/spiel').to(this.spielId).emit('zustand', zustand)
    }, STATE_BROADCAST_DEBOUNCE_MS)
  }

  erstelleZustand(fürSpielerName?: string): SpielZustand {
    const rangliste = this.scoring.berechneRangliste(this.spieler.alle())
    const lied = this.aktuellesLied

    const zustand: SpielZustand = {
      spielId: this.spielId,
      phase: this.phase,
      spieler: this.spieler.zuZustand(),
      schwierigkeit: this.konfig.schwierigkeit,
      runde: this.aktuelleRundenIndex + 1,
      gesamtRunden: this.konfig.runden,
      frist: this.rundenStart ? this.rundenStart + this.konfig.rundenDauer * 1000 : undefined,
      letzteRunde: this.aktuelleRundenIndex === this.konfig.runden - 1,
      rangliste,
      istIntroRunde: this.istIntroRunde,
      introSplashAusstehend: this.introSplashAusstehend,
      nächsterGewinntModus: this.konfig.nächsterGewinntModus,
      abgegebenAnzahl: this.spieler.alle().filter(sp => sp.hatAbgegeben).length,
      playlistName: this.konfig.playlistName,
    }

    if (lied) {
      zustand.lied = {
        artist: this.phase === 'AUFDECKEN' || this.phase === 'ENDE' ? lied.artist : '???',
        titel: this.phase === 'AUFDECKEN' || this.phase === 'ENDE' ? lied.title : '???',
        albumArt: '',
        jahr: this.phase === 'AUFDECKEN' || this.phase === 'ENDE' ? lied.year : undefined,
        funFaktDe: this.phase === 'AUFDECKEN' ? lied.fun_fact_de : undefined,
      }
      zustand.hostLied = { jahr: lied.year, funFaktDe: lied.fun_fact_de }
    }

    if (this.künstlerChallenge) {
      zustand.künstlerChallenge = {
        optionen: this.künstlerChallenge.optionen,
        gewinner: this.künstlerChallenge.gewinner,
        richtiger: this.phase === 'AUFDECKEN' ? this.künstlerChallenge.richtiger : undefined,
        ergebnisse: this.künstlerChallenge.ergebnisse,
      }
    }

    if (this.filmChallenge) {
      zustand.filmChallenge = {
        optionen: this.filmChallenge.optionen,
        richtigerFilm: this.phase === 'AUFDECKEN' ? this.filmChallenge.richtigerFilm : undefined,
        ergebnisse: this.filmChallenge.ergebnisse,
      }
    }

    if (this.phase === 'ENDE') {
      zustand.superlative = this.scoring.berechneSuperlative(this.spieler.alle())
    }

    return zustand
  }
}
