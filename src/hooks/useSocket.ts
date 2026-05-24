'use client'

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

let sharedSocket: Socket | null = null

export function useSocket() {
  const [verbunden, setVerbunden] = useState(false)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!sharedSocket || !sharedSocket.connected) {
      sharedSocket = io('/spiel', {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      })
    }

    socketRef.current = sharedSocket

    const handleConnect = () => setVerbunden(true)
    const handleDisconnect = () => setVerbunden(false)

    sharedSocket.on('connect', handleConnect)
    sharedSocket.on('disconnect', handleDisconnect)

    if (sharedSocket.connected) setVerbunden(true)

    return () => {
      sharedSocket?.off('connect', handleConnect)
      sharedSocket?.off('disconnect', handleDisconnect)
    }
  }, [])

  return { socket: socketRef.current, verbunden }
}

export function holeSocket(): Socket | null {
  return sharedSocket
}
