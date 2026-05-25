import { createServer } from 'node:http'
import { parse } from 'node:url'
import next from 'next'
import { Server as SocketServer } from 'socket.io'
import { setupSocketServer } from './src/server/socket-server.js'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)
const hostname = process.env.HOST ?? '0.0.0.0'

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? '/', true)
    handle(req, res, parsedUrl)
  })

  const io = new SocketServer(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  })

  setupSocketServer(io)

  httpServer.listen(port, hostname, () => {
    console.log(`\n🎵 Music Quiz läuft auf http://${hostname}:${port}`)
    console.log(`   Spieler:  http://localhost:${port}/spielen`)
    console.log(`   Host:     http://localhost:${port}/host`)
    console.log(`   Admin:    http://localhost:${port}/admin\n`)
  })
})
