export type SpielPhase = 'LOBBY' | 'SPIELEN' | 'AUFDECKEN' | 'ENDE' | 'PAUSIERT'
export type Schwierigkeit = 'leicht' | 'normal' | 'schwer'

export interface SpielerZustand {
  name: string
  punkte: number
  serie: number
  besteSerie: number
  verbunden: boolean
  istHost: boolean
  hatAbgegeben: boolean
  aktuelleSchätzung?: number
  rundenPunkte: number
  jahreVorbei?: number
  geschwindigkeitsMultiplikator: number
  basisPunkte: number
  serienBonus: number
  künstlerBonus: number
  filmBonus: number
  introBonus: number
  wette: boolean
  wetteErgebnis?: 'gewonnen' | 'verloren'
  stehlenVerfügbar: boolean
  stehlenBenutzt: boolean
  rundeVerpasst: boolean
  letzterRang?: number
  sessionId: string
}

export interface LiedZustand {
  artist: string
  titel: string
  albumArt: string
  jahr?: number
  funFaktDe?: string
  filmTitel?: string
}

export interface KünstlerChallenge {
  optionen: string[]
  gewinner?: string
  richtiger?: string
  ergebnisse?: { name: string; korrekt: boolean; bonus: number }[]
}

export interface FilmChallenge {
  optionen: string[]
  richtigerFilm?: string
  ergebnisse?: {
    gewinner: { name: string; zeit: number; bonus: number }[]
    falscheAntworten: { name: string; antwort: string }[]
  }
}

export interface RundenAnalytik {
  alleSchätzungen: { name: string; schätzung: number; jahreVorbei: number }[]
  durchschnittSchätzung?: number
  medianSchätzung?: number
  nächsteSpieler: string[]
  exaktesTrefferSpieler: string[]
  genauigkeitProzent: number
  geschwindigkeitsChampion?: { namen: string[]; zeit: number }
  jahrzehntVerteilung: Record<string, number>
  richtigesJahrzehnt: string
}

export interface Superlativ {
  id: string
  emoji: string
  spielerName: string
  wert: number | string
  wertLabel: string
}

export interface SpielZustand {
  spielId: string
  phase: SpielPhase
  spieler: Record<string, SpielerZustand>
  schwierigkeit: Schwierigkeit
  runde?: number
  gesamtRunden?: number
  frist?: number
  letzteRunde?: boolean
  lied?: LiedZustand
  hostLied?: Pick<LiedZustand, 'jahr' | 'funFaktDe'>
  rangliste?: { name: string; punkte: number; rang: number }[]
  künstlerChallenge?: KünstlerChallenge
  filmChallenge?: FilmChallenge
  istIntroRunde?: boolean
  introSplashAusstehend?: boolean
  nächsterGewinntModus?: boolean
  pauseGrund?: string
  beitrittsUrl?: string
  superlative?: Superlativ[]
  rundenAnalytik?: RundenAnalytik
  abgegebenAnzahl?: number
  playlistName?: string
}

export interface PlaylistLied {
  year: number
  uri: string
  artist: string
  alt_artists?: string[]
  title: string
  movie?: string
  movie_choices?: string[]
  fun_fact_de?: string
  albumArt?: string
  isrc?: string
  chart_info?: {
    billboard_peak: number
    uk_peak: number
    weeks_on_chart: number
  }
  certifications?: string[]
}

export interface Playlist {
  name: string
  version: string
  tags: string[]
  language?: string
  author?: string
  added_date?: string
  description?: string
  songs: PlaylistLied[]
}

export interface SpielRecord {
  spielId: string
  gestartetUm: number
  beendetUm: number
  dauerSekunden: number
  spielerAnzahl: number
  runden: number
  durchschnittsPunkte: number
  schwierigkeit: Schwierigkeit
  playlist: string
  gesamtWetten: number
  wettenGewonnen: number
  serie3: number
  serie5: number
  serie10: number
}

export interface LiedSpiel {
  spielId: string
  liedUri: string
  artist: string
  titel: string
  jahr: number
  playlist: string
  schwierigkeit: Schwierigkeit
  gesamtSchätzungen: number
  exakteTreffer: number
  naheTreffer: number
  gesamtJahreVorbei: number
  gespieltUm: number
}

export interface SpielKonfig {
  schwierigkeit: Schwierigkeit
  runden: number
  rundenDauer: number
  autoWeiterDelay: number
  künstlerChallenge: boolean
  filmQuiz: boolean
  introModus: boolean
  nächsterGewinntModus: boolean
  playlist: string
  tts: TTSKonfig
}

export interface TTSKonfig {
  aktiviert: boolean
  spielStart: boolean
  rundenStart: boolean
  zeitAbgelaufen: boolean
  richtigeAntwort: boolean
  exakterTreffer: boolean
  serie: boolean
  führungswechsel: boolean
  wetteGewonnen: boolean
  wettVerloren: boolean
  letzteRunde: boolean
  podium: boolean
  wiederbeitreten: boolean
}

export interface ClientNachricht {
  type: string
  [key: string]: unknown
}

export interface ServerNachricht {
  type: string
  [key: string]: unknown
}
