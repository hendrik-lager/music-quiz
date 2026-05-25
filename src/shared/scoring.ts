import type { Schwierigkeit } from './types'
import { PUNKTE_TABELLEN, SERIE_BONUS_TABELLE, WETT_MULTIPLIKATOR } from './constants'

export interface PunkteBerechnungErgebnis {
  basisPunkte: number
  geschwindigkeitsMultiplikator: number
  serienBonus: number
  wetteMultiplikator: number
  endPunkte: number
  istExakt: boolean
  istNah: boolean
}

export function berechneBasisPunkte(schätzung: number, richtigesJahr: number, schwierigkeit: Schwierigkeit): number {
  const abweichung = Math.abs(schätzung - richtigesJahr)
  const tabelle = PUNKTE_TABELLEN[schwierigkeit]

  if (abweichung <= tabelle.tier1Abweichung) return tabelle.tier1
  if (abweichung <= tabelle.tier2Abweichung) return tabelle.tier2
  return tabelle.tier3
}

export function berechneGeschwindigkeitsMultiplikator(abgabeZeit: number, startZeit: number, rundenDauer: number): number {
  const verstricheneZeit = (abgabeZeit - startZeit) / 1000
  const restZeit = Math.max(0, rundenDauer - verstricheneZeit)
  const verhältnis = restZeit / rundenDauer
  return 1 + verhältnis
}

export function berechneSerienBonus(serie: number): number {
  let bonus = 0
  for (const meilenstein of Object.keys(SERIE_BONUS_TABELLE).map(Number).sort((a, b) => b - a)) {
    if (serie >= meilenstein) {
      bonus = SERIE_BONUS_TABELLE[meilenstein]
      break
    }
  }
  return bonus
}

export function berechnePunkte(
  schätzung: number,
  richtigesJahr: number,
  schwierigkeit: Schwierigkeit,
  abgabeZeit: number,
  startZeit: number,
  rundenDauer: number,
  serie: number,
  wette: boolean,
  nächsterGewinntModus = false,
  istNächster = false,
): PunkteBerechnungErgebnis {
  const abweichung = Math.abs(schätzung - richtigesJahr)
  const tabelle = PUNKTE_TABELLEN[schwierigkeit]
  const istExakt = abweichung === 0
  const istNah = abweichung <= tabelle.tier2Abweichung && abweichung > tabelle.tier1Abweichung

  let basisPunkte = berechneBasisPunkte(schätzung, richtigesJahr, schwierigkeit)

  if (nächsterGewinntModus && !istNächster) {
    basisPunkte = 0
  }

  const geschwindigkeitsMultiplikator = basisPunkte > 0
    ? berechneGeschwindigkeitsMultiplikator(abgabeZeit, startZeit, rundenDauer)
    : 1

  const serienBonus = berechneSerienBonus(serie)

  let wetteMultiplikator = 1
  if (wette) {
    wetteMultiplikator = istExakt ? WETT_MULTIPLIKATOR : 0
  }

  const endPunkte = Math.round(
    (basisPunkte * geschwindigkeitsMultiplikator + serienBonus) * (wette ? wetteMultiplikator : 1)
  )

  return {
    basisPunkte,
    geschwindigkeitsMultiplikator,
    serienBonus,
    wetteMultiplikator,
    endPunkte: Math.max(0, endPunkte),
    istExakt,
    istNah,
  }
}

export function bestimmeNeueSerie(schätzung: number, richtigesJahr: number, schwierigkeit: Schwierigkeit, aktueleSerie: number): number {
  const basisPunkte = berechneBasisPunkte(schätzung, richtigesJahr, schwierigkeit)
  return basisPunkte > 0 ? aktueleSerie + 1 : 0
}
