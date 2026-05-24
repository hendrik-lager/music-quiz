'use client'

import { useEffect, useState, useCallback } from 'react'
import type { SpielZustand } from '@/shared/types'
import { holeSocket } from './useSocket'

export function useGameState() {
  const [zustand, setZustand] = useState<SpielZustand | null>(null)

  useEffect(() => {
    const socket = holeSocket()
    if (!socket) return

    const handleZustand = (data: SpielZustand) => {
      setZustand(data)
    }

    socket.on('zustand', handleZustand)

    socket.emit('zustand_anfordern')

    return () => {
      socket.off('zustand', handleZustand)
    }
  }, [])

  return zustand
}

export function useCountdown(frist: number | undefined): number {
  const [sekunden, setSekunden] = useState(0)

  useEffect(() => {
    if (!frist) {
      setSekunden(0)
      return
    }

    const berechne = () => {
      const verbleibend = Math.max(0, Math.round((frist - Date.now()) / 1000))
      setSekunden(verbleibend)
    }

    berechne()
    const interval = setInterval(berechne, 250)
    return () => clearInterval(interval)
  }, [frist])

  return sekunden
}
