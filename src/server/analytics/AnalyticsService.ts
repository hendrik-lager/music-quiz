import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SpielRecord, LiedSpiel } from '../../shared/types'

const DATA_DIR = process.env.DATA_DIR ?? './data'

declare global {
  // eslint-disable-next-line no-var
  var __analyticsService: AnalyticsService | undefined
}

export class AnalyticsService {
  private db: Database.Database

  constructor() {
    mkdirSync(DATA_DIR, { recursive: true })
    this.db = new Database(join(DATA_DIR, 'analytics.db'))
    this.db.pragma('journal_mode = WAL')
    this.initialisiereSchema()
  }

  static getInstance(): AnalyticsService {
    if (!globalThis.__analyticsService) {
      globalThis.__analyticsService = new AnalyticsService()
    }
    return globalThis.__analyticsService
  }

  private initialisiereSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spiele (
        id TEXT PRIMARY KEY,
        gestartet_um INTEGER NOT NULL,
        beendet_um INTEGER NOT NULL,
        dauer_s INTEGER NOT NULL,
        spieler_anzahl INTEGER NOT NULL,
        runden INTEGER NOT NULL,
        durchschnitt_punkte REAL NOT NULL,
        schwierigkeit TEXT NOT NULL,
        playlist TEXT NOT NULL,
        gesamt_wetten INTEGER NOT NULL DEFAULT 0,
        wetten_gewonnen INTEGER NOT NULL DEFAULT 0,
        serie_3 INTEGER NOT NULL DEFAULT 0,
        serie_5 INTEGER NOT NULL DEFAULT 0,
        serie_10 INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS lied_spiele (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spiel_id TEXT NOT NULL,
        lied_uri TEXT NOT NULL,
        artist TEXT NOT NULL,
        titel TEXT NOT NULL,
        jahr INTEGER NOT NULL,
        playlist TEXT NOT NULL,
        schwierigkeit TEXT NOT NULL,
        gesamt_schaetzungen INTEGER NOT NULL DEFAULT 0,
        exakte_treffer INTEGER NOT NULL DEFAULT 0,
        nahe_treffer INTEGER NOT NULL DEFAULT 0,
        gesamt_jahre_vorbei INTEGER NOT NULL DEFAULT 0,
        gespielt_um INTEGER NOT NULL,
        FOREIGN KEY (spiel_id) REFERENCES spiele(id)
      );

      CREATE TABLE IF NOT EXISTS fehler_ereignisse (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        zeitstempel INTEGER NOT NULL,
        typ TEXT NOT NULL,
        nachricht TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_spiele_beendet ON spiele(beendet_um);
      CREATE INDEX IF NOT EXISTS idx_lied_uri ON lied_spiele(lied_uri);
      CREATE INDEX IF NOT EXISTS idx_fehler_zeit ON fehler_ereignisse(zeitstempel);
    `)
  }

  async zeichneSpielAuf(record: SpielRecord): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO spiele
        (id, gestartet_um, beendet_um, dauer_s, spieler_anzahl, runden, durchschnitt_punkte, schwierigkeit, playlist, gesamt_wetten, wetten_gewonnen, serie_3, serie_5, serie_10)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.spielId,
      record.gestartetUm,
      record.beendetUm,
      record.dauerSekunden,
      record.spielerAnzahl,
      record.runden,
      record.durchschnittsPunkte,
      record.schwierigkeit,
      record.playlist,
      record.gesamtWetten,
      record.wettenGewonnen,
      record.serie3,
      record.serie5,
      record.serie10,
    )
  }

  async zeichneRundeAuf(liedSpiel: LiedSpiel): Promise<void> {
    this.db.prepare(`
      INSERT INTO lied_spiele
        (spiel_id, lied_uri, artist, titel, jahr, playlist, schwierigkeit, gesamt_schaetzungen, exakte_treffer, nahe_treffer, gesamt_jahre_vorbei, gespielt_um)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      liedSpiel.spielId,
      liedSpiel.liedUri,
      liedSpiel.artist,
      liedSpiel.titel,
      liedSpiel.jahr,
      liedSpiel.playlist,
      liedSpiel.schwierigkeit,
      liedSpiel.gesamtSchätzungen,
      liedSpiel.exakteTreffer,
      liedSpiel.naheTreffer,
      liedSpiel.gesamtJahreVorbei,
      liedSpiel.gespieltUm,
    )
  }

  holeSpielVerlauf(limit = 50): SpielRecord[] {
    const zeilen = this.db.prepare(`
      SELECT * FROM spiele ORDER BY beendet_um DESC LIMIT ?
    `).all(limit) as Record<string, unknown>[]

    return zeilen.map(z => ({
      spielId: z.id as string,
      gestartetUm: z.gestartet_um as number,
      beendetUm: z.beendet_um as number,
      dauerSekunden: z.dauer_s as number,
      spielerAnzahl: z.spieler_anzahl as number,
      runden: z.runden as number,
      durchschnittsPunkte: z.durchschnitt_punkte as number,
      schwierigkeit: z.schwierigkeit as SpielRecord['schwierigkeit'],
      playlist: z.playlist as string,
      gesamtWetten: z.gesamt_wetten as number,
      wettenGewonnen: z.wetten_gewonnen as number,
      serie3: z.serie_3 as number,
      serie5: z.serie_5 as number,
      serie10: z.serie_10 as number,
    }))
  }

  holeSchwierigsteLieder(limit = 20): { uri: string; artist: string; titel: string; jahr: number; durchschnittAbweichung: number; gespielt: number }[] {
    return this.db.prepare(`
      SELECT lied_uri, artist, titel, jahr,
             CAST(gesamt_jahre_vorbei AS REAL) / NULLIF(gesamt_schaetzungen, 0) as durchschnitt_abweichung,
             COUNT(*) as gespielt
      FROM lied_spiele
      WHERE gesamt_schaetzungen > 0
      GROUP BY lied_uri
      ORDER BY durchschnitt_abweichung DESC
      LIMIT ?
    `).all(limit) as { uri: string; artist: string; titel: string; jahr: number; durchschnittAbweichung: number; gespielt: number }[]
  }

  holeGesamtStatistiken(): { gesamtSpiele: number; gesamtRunden: number; gesamtSpieler: number; durchschnittDauer: number } {
    const result = this.db.prepare(`
      SELECT
        COUNT(*) as gesamt_spiele,
        SUM(runden) as gesamt_runden,
        SUM(spieler_anzahl) as gesamt_spieler,
        AVG(dauer_s) as durchschnitt_dauer
      FROM spiele
    `).get() as Record<string, number> | undefined

    return {
      gesamtSpiele: result?.gesamt_spiele ?? 0,
      gesamtRunden: result?.gesamt_runden ?? 0,
      gesamtSpieler: result?.gesamt_spieler ?? 0,
      durchschnittDauer: result?.durchschnitt_dauer ?? 0,
    }
  }
}
