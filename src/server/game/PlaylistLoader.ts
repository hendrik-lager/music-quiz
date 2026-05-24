import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Playlist, PlaylistLied } from '../../shared/types'

const PLAYLISTS_DIR = process.env.PLAYLISTS_DIR ?? './playlists'

let cachedPlaylists: Map<string, Playlist> | null = null

export async function ladePlaylists(): Promise<Map<string, Playlist>> {
  if (cachedPlaylists) return cachedPlaylists

  const playlists = new Map<string, Playlist>()
  await ladeAusVerzeichnis(PLAYLISTS_DIR, playlists)
  await ladeAusVerzeichnis(join(PLAYLISTS_DIR, 'community'), playlists)

  cachedPlaylists = playlists
  console.log(`[Playlisten] ${playlists.size} Playlisten geladen`)
  return playlists
}

async function ladeAusVerzeichnis(dir: string, playlists: Map<string, Playlist>): Promise<void> {
  try {
    const dateien = await readdir(dir)
    for (const datei of dateien) {
      if (!datei.endsWith('.json')) continue
      try {
        const inhalt = await readFile(join(dir, datei), 'utf-8')
        const playlist = JSON.parse(inhalt) as Playlist
        const slug = datei.replace('.json', '')
        playlists.set(slug, playlist)
      } catch (err) {
        console.error(`[Playlisten] Fehler beim Laden von ${datei}:`, err)
      }
    }
  } catch {
    // Verzeichnis nicht vorhanden
  }
}

export async function ladePlaylist(slug: string): Promise<Playlist | null> {
  const playlists = await ladePlaylists()
  return playlists.get(slug) ?? null
}

export async function holePlaylistListe(): Promise<{ slug: string; name: string; anzahlLieder: number; tags: string[] }[]> {
  const playlists = await ladePlaylists()
  return Array.from(playlists.entries()).map(([slug, pl]) => ({
    slug,
    name: pl.name,
    anzahlLieder: pl.songs.length,
    tags: pl.tags ?? [],
  }))
}

export function mischeLieder(lieder: PlaylistLied[]): PlaylistLied[] {
  const kopie = [...lieder]
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[kopie[i], kopie[j]] = [kopie[j], kopie[i]]
  }
  return kopie
}

export function wähleKünstlerOptionen(richtigerArtist: string, altArtists: string[], alleLieder: PlaylistLied[]): string[] {
  const optionen = new Set<string>([richtigerArtist])

  for (const alt of (altArtists ?? [])) {
    if (optionen.size >= 4) break
    optionen.add(alt)
  }

  const alleArtisten = alleLieder.map(l => l.artist).filter(a => !optionen.has(a))
  const gemischt = [...alleArtisten].sort(() => Math.random() - 0.5)
  for (const artist of gemischt) {
    if (optionen.size >= 4) break
    optionen.add(artist)
  }

  return [...optionen].sort(() => Math.random() - 0.5)
}

export function wähleFilmOptionen(richtigerFilm: string, liedFilmOptionen: string[] | undefined, alleLieder: PlaylistLied[]): string[] {
  const optionen = new Set<string>([richtigerFilm])

  for (const opt of (liedFilmOptionen ?? [])) {
    if (optionen.size >= 3) break
    optionen.add(opt)
  }

  const alleFilme = alleLieder.flatMap(l => l.movie ? [l.movie] : []).filter(f => !optionen.has(f))
  const gemischt = [...new Set(alleFilme)].sort(() => Math.random() - 0.5)
  for (const film of gemischt) {
    if (optionen.size >= 3) break
    optionen.add(film)
  }

  return [...optionen].sort(() => Math.random() - 0.5)
}
