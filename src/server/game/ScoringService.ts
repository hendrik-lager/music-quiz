import type { Schwierigkeit, Superlativ } from '../../shared/types'
import {
  berechneBasisPunkte,
  berechneGeschwindigkeitsMultiplikator,
  berechneSerienBonus,
  bestimmeNeueSerie,
} from '../../shared/scoring'
import { WETT_MULTIPLIKATOR, SUPERLATIV_DEFINITIONEN } from '../../shared/constants'
import type { SpielerSession } from './PlayerRegistry'

export interface RundenPunkteErgebnis {
  name: string
  basisPunkte: number
  geschwindigkeitsMultiplikator: number
  serienBonus: number
  wetteMultiplikator: number
  rundenPunkte: number
  istExakt: boolean
  istNah: boolean
  jahreVorbei: number
  neueSerie: number
}

export class ScoringService {
  berechneRunde(
    spieler: SpielerSession[],
    richtigesJahr: number,
    schwierigkeit: Schwierigkeit,
    rundenStart: number,
    rundenDauer: number,
    nächsterGewinntModus: boolean,
  ): RundenPunkteErgebnis[] {
    const mitAbgabe = spieler.filter(sp => sp.hatAbgegeben && sp.aktuelleSchätzung !== null)

    if (nächsterGewinntModus && mitAbgabe.length > 0) {
      const nächster = this.findeNächsten(mitAbgabe, richtigesJahr)
      return mitAbgabe.map(sp => this.berechneEinzelPunkte(sp, richtigesJahr, schwierigkeit, rundenStart, rundenDauer, sp.name === nächster, true))
    }

    return mitAbgabe.map(sp => this.berechneEinzelPunkte(sp, richtigesJahr, schwierigkeit, rundenStart, rundenDauer, false, false))
  }

  private berechneEinzelPunkte(
    spieler: SpielerSession,
    richtigesJahr: number,
    schwierigkeit: Schwierigkeit,
    rundenStart: number,
    rundenDauer: number,
    istNächster: boolean,
    nächsterGewinntModus: boolean,
  ): RundenPunkteErgebnis {
    const schätzung = spieler.aktuelleSchätzung!
    const abgabeZeit = spieler.abgabeZeit!
    const jahreVorbei = Math.abs(schätzung - richtigesJahr)

    let basisPunkte = berechneBasisPunkte(schätzung, richtigesJahr, schwierigkeit)
    if (nächsterGewinntModus && !istNächster) basisPunkte = 0

    const istExakt = jahreVorbei === 0
    const istNah = jahreVorbei <= (schwierigkeit === 'leicht' ? 7 : schwierigkeit === 'normal' ? 3 : 2) && !istExakt

    const geschwindigkeitsMultiplikator = basisPunkte > 0
      ? berechneGeschwindigkeitsMultiplikator(abgabeZeit, rundenStart, rundenDauer)
      : 1

    const serienBonus = berechneSerienBonus(spieler.serie)

    let wetteMultiplikator = 1
    if (spieler.wette) {
      wetteMultiplikator = istExakt ? WETT_MULTIPLIKATOR : 0
    }

    const rundenPunkte = spieler.wette
      ? Math.round((basisPunkte * geschwindigkeitsMultiplikator + serienBonus) * wetteMultiplikator)
      : Math.round(basisPunkte * geschwindigkeitsMultiplikator + serienBonus)

    const neueSerie = bestimmeNeueSerie(schätzung, richtigesJahr, schwierigkeit, spieler.serie)

    return {
      name: spieler.name,
      basisPunkte,
      geschwindigkeitsMultiplikator,
      serienBonus,
      wetteMultiplikator,
      rundenPunkte: Math.max(0, rundenPunkte),
      istExakt,
      istNah,
      jahreVorbei,
      neueSerie,
    }
  }

  private findeNächsten(spieler: SpielerSession[], richtigesJahr: number): string {
    let bester = spieler[0]
    let besteAbweichung = Math.abs(bester.aktuelleSchätzung! - richtigesJahr)

    for (const sp of spieler) {
      const abweichung = Math.abs(sp.aktuelleSchätzung! - richtigesJahr)
      if (abweichung < besteAbweichung || (abweichung === besteAbweichung && sp.abgabeZeit! < bester.abgabeZeit!)) {
        bester = sp
        besteAbweichung = abweichung
      }
    }
    return bester.name
  }

  berechneRangliste(spieler: SpielerSession[]): { name: string; punkte: number; rang: number }[] {
    const sortiert = [...spieler].sort((a, b) => b.punkte - a.punkte || a.name.localeCompare(b.name))
    return sortiert.map((sp, i) => ({
      name: sp.name,
      punkte: sp.punkte,
      rang: i + 1,
    }))
  }

  berechneSuperlative(spieler: SpielerSession[]): Superlativ[] {
    const superlative: Superlativ[] = []
    if (spieler.length === 0) return superlative

    const mitAbgaben = spieler.filter(sp => sp.abgabeZeiten.length > 0)

    if (mitAbgaben.length > 0) {
      const schnellster = mitAbgaben.reduce((prev, curr) => {
        const avgPrev = prev.abgabeZeiten.reduce((a, b) => a + b, 0) / prev.abgabeZeiten.length
        const avgCurr = curr.abgabeZeiten.reduce((a, b) => a + b, 0) / curr.abgabeZeiten.length
        return avgCurr < avgPrev ? curr : prev
      })
      superlative.push({
        id: 'speedDemon',
        emoji: '⚡',
        spielerName: schnellster.name,
        wert: Math.round(schnellster.abgabeZeiten.reduce((a, b) => a + b, 0) / schnellster.abgabeZeiten.length / 1000 * 10) / 10,
        wertLabel: 'Sekunden Durchschnitt',
      })
    }

    const längsteSeriesSpieler = spieler.reduce((prev, curr) => curr.besteSerie > prev.besteSerie ? curr : prev)
    if (längsteSeriesSpieler.besteSerie >= 3) {
      superlative.push({
        id: 'luckyStreak',
        emoji: '🔥',
        spielerName: längsteSeriesSpieler.name,
        wert: längsteSeriesSpieler.besteSerie,
        wertLabel: 'in Folge richtig',
      })
    }

    const risikoSpieler = spieler.filter(sp => sp.wettenGesetzt > 0)
      .reduce((prev, curr) => curr.wettenGesetzt > prev.wettenGesetzt ? curr : prev, spieler[0])
    if (risikoSpieler && risikoSpieler.wettenGesetzt > 0) {
      superlative.push({
        id: 'riskTaker',
        emoji: '🎰',
        spielerName: risikoSpieler.name,
        wert: risikoSpieler.wettenGesetzt,
        wertLabel: 'Wetten gesetzt',
      })
    }

    const filmKenner = spieler.filter(sp => sp.filmBonusGesamt > 0)
      .reduce((prev, curr) => curr.filmBonusGesamt > prev.filmBonusGesamt ? curr : prev, spieler[0])
    if (filmKenner && filmKenner.filmBonusGesamt > 0) {
      superlative.push({
        id: 'filmBuff',
        emoji: '🎬',
        spielerName: filmKenner.name,
        wert: filmKenner.filmBonusGesamt,
        wertLabel: 'Film-Bonus-Punkte',
      })
    }

    const haarscharf = spieler.filter(sp => sp.naheTreffer > 0)
      .reduce((prev, curr) => curr.naheTreffer > prev.naheTreffer ? curr : prev, spieler[0])
    if (haarscharf && haarscharf.naheTreffer > 0) {
      superlative.push({
        id: 'closeCall',
        emoji: '😅',
        spielerName: haarscharf.name,
        wert: haarscharf.naheTreffer,
        wertLabel: 'knappe Treffer',
      })
    }

    const bullseye = spieler.filter(sp => sp.exakteTreffer > 0)
      .reduce((prev, curr) => curr.exakteTreffer > prev.exakteTreffer ? curr : prev, spieler[0])
    if (bullseye && bullseye.exakteTreffer > 0) {
      superlative.push({
        id: 'exactMatcher',
        emoji: '🎯',
        spielerName: bullseye.name,
        wert: bullseye.exakteTreffer,
        wertLabel: 'exakte Treffer',
      })
    }

    const künstlerExperte = spieler.filter(sp => sp.künstlerKorrekt > 0)
      .reduce((prev, curr) => curr.künstlerKorrekt > prev.künstlerKorrekt ? curr : prev, spieler[0])
    if (künstlerExperte && künstlerExperte.künstlerKorrekt > 0) {
      superlative.push({
        id: 'artistExpert',
        emoji: '🎤',
        spielerName: künstlerExperte.name,
        wert: künstlerExperte.künstlerKorrekt,
        wertLabel: 'Künstler erkannt',
      })
    }

    return superlative
  }
}
