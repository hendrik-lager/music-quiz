import { v4 as uuid } from 'uuid'
import type { SpielerZustand } from '../../shared/types'

export interface SpielerSession {
  name: string
  sessionId: string
  socketId: string
  punkte: number
  serie: number
  besteSerie: number
  verbunden: boolean
  istHost: boolean
  hatAbgegeben: boolean
  aktuelleSchätzung: number | null
  abgabeZeit: number | null
  rundenPunkte: number
  jahreVorbei: number | null
  geschwindigkeitsMultiplikator: number
  basisPunkte: number
  serienBonus: number
  künstlerBonus: number
  filmBonus: number
  introBonus: number
  wette: boolean
  wetteErgebnis: 'gewonnen' | 'verloren' | null
  stehlenVerfügbar: boolean
  stehlenBenutzt: boolean
  gestohlenVon: string | null
  hatGestohlenVon: string | null
  rundeVerpasst: boolean
  letzterRang: number | null
  abgabeZeiten: number[]
  rundenPunkteListe: number[]
  wettenGesetzt: number
  wettenGewonnen: number
  naheTreffer: number
  exakteTreffer: number
  introSchnellBonus: number
  filmBonusGesamt: number
  künstlerKorrekt: number
  hatKünstlerRateEingereicht: boolean
  hatFilmRateEingereicht: boolean
}

export class PlayerRegistry {
  private spieler = new Map<string, SpielerSession>()
  private sessionIndex = new Map<string, string>()

  erstelle(name: string, socketId: string, istHost = false): SpielerSession {
    const sessionId = uuid()
    const spieler: SpielerSession = {
      name,
      sessionId,
      socketId,
      punkte: 0,
      serie: 0,
      besteSerie: 0,
      verbunden: true,
      istHost,
      hatAbgegeben: false,
      aktuelleSchätzung: null,
      abgabeZeit: null,
      rundenPunkte: 0,
      jahreVorbei: null,
      geschwindigkeitsMultiplikator: 1,
      basisPunkte: 0,
      serienBonus: 0,
      künstlerBonus: 0,
      filmBonus: 0,
      introBonus: 0,
      wette: false,
      wetteErgebnis: null,
      stehlenVerfügbar: false,
      stehlenBenutzt: false,
      gestohlenVon: null,
      hatGestohlenVon: null,
      rundeVerpasst: false,
      letzterRang: null,
      abgabeZeiten: [],
      rundenPunkteListe: [],
      wettenGesetzt: 0,
      wettenGewonnen: 0,
      naheTreffer: 0,
      exakteTreffer: 0,
      introSchnellBonus: 0,
      filmBonusGesamt: 0,
      künstlerKorrekt: 0,
      hatKünstlerRateEingereicht: false,
      hatFilmRateEingereicht: false,
    }
    this.spieler.set(name, spieler)
    this.sessionIndex.set(sessionId, name)
    return spieler
  }

  holePerName(name: string): SpielerSession | undefined {
    return this.spieler.get(name)
  }

  holePerSession(sessionId: string): SpielerSession | undefined {
    const name = this.sessionIndex.get(sessionId)
    return name ? this.spieler.get(name) : undefined
  }

  holePerSocket(socketId: string): SpielerSession | undefined {
    for (const spieler of this.spieler.values()) {
      if (spieler.socketId === socketId) return spieler
    }
    return undefined
  }

  alle(): SpielerSession[] {
    return [...this.spieler.values()]
  }

  alleVerbunden(): SpielerSession[] {
    return this.alle().filter(s => s.verbunden)
  }

  entferne(name: string): void {
    const spieler = this.spieler.get(name)
    if (spieler) {
      this.sessionIndex.delete(spieler.sessionId)
      this.spieler.delete(name)
    }
  }

  existiert(name: string): boolean {
    return this.spieler.has(name)
  }

  resetRundenDaten(): void {
    for (const spieler of this.spieler.values()) {
      spieler.hatAbgegeben = false
      spieler.aktuelleSchätzung = null
      spieler.abgabeZeit = null
      spieler.rundenPunkte = 0
      spieler.jahreVorbei = null
      spieler.geschwindigkeitsMultiplikator = 1
      spieler.basisPunkte = 0
      spieler.serienBonus = 0
      spieler.künstlerBonus = 0
      spieler.filmBonus = 0
      spieler.introBonus = 0
      spieler.wette = false
      spieler.wetteErgebnis = null
      spieler.gestohlenVon = null
      spieler.hatGestohlenVon = null
      spieler.rundeVerpasst = false
      spieler.hatKünstlerRateEingereicht = false
      spieler.hatFilmRateEingereicht = false
    }
  }

  zuZustand(): Record<string, SpielerZustand> {
    const ergebnis: Record<string, SpielerZustand> = {}
    for (const sp of this.spieler.values()) {
      ergebnis[sp.name] = {
        name: sp.name,
        punkte: sp.punkte,
        serie: sp.serie,
        besteSerie: sp.besteSerie,
        verbunden: sp.verbunden,
        istHost: sp.istHost,
        hatAbgegeben: sp.hatAbgegeben,
        aktuelleSchätzung: sp.aktuelleSchätzung ?? undefined,
        rundenPunkte: sp.rundenPunkte,
        jahreVorbei: sp.jahreVorbei ?? undefined,
        geschwindigkeitsMultiplikator: sp.geschwindigkeitsMultiplikator,
        basisPunkte: sp.basisPunkte,
        serienBonus: sp.serienBonus,
        künstlerBonus: sp.künstlerBonus,
        filmBonus: sp.filmBonus,
        introBonus: sp.introBonus,
        wette: sp.wette,
        wetteErgebnis: sp.wetteErgebnis ?? undefined,
        stehlenVerfügbar: sp.stehlenVerfügbar,
        stehlenBenutzt: sp.stehlenBenutzt,
        rundeVerpasst: sp.rundeVerpasst,
        letzterRang: sp.letzterRang ?? undefined,
        sessionId: sp.sessionId,
      }
    }
    return ergebnis
  }
}
