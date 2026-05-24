'use client'

import { useState, useEffect } from 'react'

interface Session {
  sessionId: string | null
  spielerName: string | null
  spielId: string | null
}

const SESSION_KEY = 'music_quiz_session'

export function useSession() {
  const [session, setSession] = useState<Session>({
    sessionId: null,
    spielerName: null,
    spielId: null,
  })

  useEffect(() => {
    try {
      const gespeichert = localStorage.getItem(SESSION_KEY)
      if (gespeichert) {
        setSession(JSON.parse(gespeichert) as Session)
      }
    } catch {
      // localStorage nicht verfügbar
    }
  }, [])

  const speichere = (daten: Partial<Session>) => {
    setSession(prev => {
      const neu = { ...prev, ...daten }
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(neu))
      } catch {}
      return neu
    })
  }

  const lösche = () => {
    setSession({ sessionId: null, spielerName: null, spielId: null })
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {}
  }

  return { session, speichere, lösche }
}
