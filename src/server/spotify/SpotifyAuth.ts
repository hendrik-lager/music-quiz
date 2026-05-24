interface SpotifyTokenData {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

declare global {
  // eslint-disable-next-line no-var
  var __spotifyAuth: SpotifyAuth | undefined
}

export class SpotifyAuth {
  private tokenData: SpotifyTokenData | null = null
  private deviceId: string | null = null

  static getInstance(): SpotifyAuth {
    if (!globalThis.__spotifyAuth) {
      globalThis.__spotifyAuth = new SpotifyAuth()
    }
    return globalThis.__spotifyAuth
  }

  holeAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.SPOTIFY_CLIENT_ID ?? '',
      response_type: 'code',
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI ?? '',
      state,
      scope: [
        'streaming',
        'user-read-email',
        'user-read-private',
        'user-modify-playback-state',
        'user-read-playback-state',
      ].join(' '),
    })
    return `https://accounts.spotify.com/authorize?${params.toString()}`
  }

  async tauschCode(code: string): Promise<boolean> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI ?? '',
    })

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: body.toString(),
    })

    if (!res.ok) return false

    const daten = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
    this.tokenData = {
      accessToken: daten.access_token,
      refreshToken: daten.refresh_token,
      expiresAt: Date.now() + (daten.expires_in - 60) * 1000,
    }
    return true
  }

  async holeAccessToken(): Promise<string | null> {
    if (!this.tokenData) return null
    if (Date.now() < this.tokenData.expiresAt) return this.tokenData.accessToken

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.tokenData.refreshToken,
    })

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: body.toString(),
    })

    if (!res.ok) return null

    const daten = await res.json() as { access_token: string; expires_in: number }
    this.tokenData.accessToken = daten.access_token
    this.tokenData.expiresAt = Date.now() + (daten.expires_in - 60) * 1000
    return this.tokenData.accessToken
  }

  istAngemeldet(): boolean {
    return this.tokenData !== null
  }

  setzeDeviceId(id: string): void {
    this.deviceId = id
  }

  holeDeviceId(): string | null {
    return this.deviceId
  }

  async spieleTrack(uri: string): Promise<boolean> {
    const token = await this.holeAccessToken()
    if (!token || !this.deviceId) return false

    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: [uri] }),
    })
    return res.ok
  }

  async pause(): Promise<boolean> {
    const token = await this.holeAccessToken()
    if (!token) return false

    const res = await fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok
  }
}
