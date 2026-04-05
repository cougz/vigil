import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import { join, dirname } from 'path'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import config from './config.js'
import healthRoute from './routes/health.js'
import devicesRoute from './routes/devices.js'
import powerRoute from './routes/power.js'
import kvmRoute from './routes/kvm.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = Fastify({
  logger: {
    level: config.logLevel,
    ...(config.nodeEnv !== 'production'
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }
      : {}),
  },
})

await app.register(fastifyWebsocket)

await app.register(fastifyStatic, {
  root: join(__dirname, 'public'),
  wildcard: false,
})

app.register(healthRoute)
app.register(devicesRoute)
app.register(powerRoute)
app.register(kvmRoute)

app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
    return reply.status(404).send({ error: 'Not found' })
  }
  const indexPath = join(__dirname, 'public', 'index.html')
  if (existsSync(indexPath)) {
    return reply.type('text/html').send(readFileSync(indexPath))
  }
  return reply.status(404).send({ error: 'Not found' })
})

await app.listen({ port: config.port, host: config.host })

app.log.info(`Vigil running on http://${config.host}:${config.port}`)
app.log.info(`Log viewer: http://${config.host}:8080`)
