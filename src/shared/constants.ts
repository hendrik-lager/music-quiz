import type { Schwierigkeit } from './types'

export const JAHR_MIN = 1950
export const JAHR_MAX = 2026
export const MAX_SPIELER = 20
export const MIN_SPIELER = 1
export const MAX_NAMEN_LÄNGE = 20
export const STANDARD_RUNDEN_DAUER = 45
export const STANDARD_RUNDEN = 10
export const RECONNECT_GRACE_PERIOD_MS = 5000
export const STATE_BROADCAST_DEBOUNCE_MS = 50
export const SPIELER_ENTFERNUNG_DELAY_MS = 5000

export const PUNKTE_TABELLEN: Record<Schwierigkeit, { tier1: number; tier1Abweichung: number; tier2: number; tier2Abweichung: number; tier3: number }> = {
  leicht: { tier1: 10, tier1Abweichung: 0, tier2: 5, tier2Abweichung: 7, tier3: 1 },
  normal: { tier1: 10, tier1Abweichung: 0, tier2: 5, tier2Abweichung: 3, tier3: 1 },
  schwer: { tier1: 10, tier1Abweichung: 0, tier2: 3, tier2Abweichung: 2, tier3: 0 },
}

export const SERIE_MEILENSTEINE = [3, 5, 10, 15, 20, 25]
export const SERIE_BONUS_TABELLE: Record<number, number> = {
  3: 1,
  5: 2,
  10: 3,
  15: 5,
  20: 8,
  25: 10,
}

export const WETT_MULTIPLIKATOR = 3
export const KÜNSTLER_BONUS = 5
export const INTRO_BONUS_MAX = 5
export const FILM_BONUS_TABELLEN = [5, 3, 1]

export const STEHLEN_SERIE_SCHWELLE = 3
export const MAX_STEALS_PRO_SPIEL = 1

export const REAKTIONEN = ['🎵', '🔥', '❤️', '😂', '😮', '👏', '🎉', '💀']

export const SUPERLATIV_DEFINITIONEN = [
  { id: 'speedDemon', emoji: '⚡', label: 'Blitzschnell' },
  { id: 'luckyStreak', emoji: '🔥', label: 'Heiße Serie' },
  { id: 'riskTaker', emoji: '🎰', label: 'Risikospieler' },
  { id: 'filmBuff', emoji: '🎬', label: 'Filmkenner' },
  { id: 'closeCall', emoji: '😅', label: 'Haarscharf' },
  { id: 'comebackKing', emoji: '👑', label: 'Comeback-König' },
  { id: 'exactMatcher', emoji: '🎯', label: 'Bullseye' },
  { id: 'artistExpert', emoji: '🎤', label: 'Künstler-Experte' },
] as const

export const TTS_STANDARD_KONFIG = {
  aktiviert: true,
  spielStart: true,
  rundenStart: false,
  zeitAbgelaufen: true,
  richtigeAntwort: true,
  exakterTreffer: true,
  serie: true,
  führungswechsel: true,
  wetteGewonnen: true,
  wettVerloren: false,
  letzteRunde: true,
  podium: true,
  wiederbeitreten: false,
}

export const STANDARD_KONFIG = {
  schwierigkeit: 'normal' as Schwierigkeit,
  runden: STANDARD_RUNDEN,
  rundenDauer: STANDARD_RUNDEN_DAUER,
  autoWeiterDelay: 10,
  künstlerChallenge: true,
  filmQuiz: true,
  introModus: true,
  nächsterGewinntModus: false,
  playlist: '',
  tts: TTS_STANDARD_KONFIG,
}
