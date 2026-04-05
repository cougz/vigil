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
import { setStoreLogger } from './lib/devices-store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = Fastify({
  logger: {
    level: config.logLevel,
    ...(config.nodeEnv !== 'production'
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }
      : {}),
  },
})

setStoreLogger(app.log)

app.log.info(config, 'Loaded configuration')

await app.register(fastifyWebsocket)
app.log.debug('Registered @fastify/websocket')

await app.register(fastifyStatic, {
  root: join(__dirname, 'public'),
  wildcard: false,
})
app.log.debug({ root: join(__dirname, 'public') }, 'Registered @fastify/static')

app.register(healthRoute)
app.register(devicesRoute)
app.register(powerRoute)
app.register(kvmRoute)
app.log.debug('Registered all routes')

app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
    request.log.warn({ url: request.url }, 'API/WS route not found')
    return reply.status(404).send({ error: 'Not found' })
  }
  const indexPath = join(__dirname, 'public', 'index.html')
  if (existsSync(indexPath)) {
    request.log.debug({ url: request.url }, 'SPA fallback serving index.html')
    return reply.type('text/html').send(readFileSync(indexPath))
  }
  request.log.warn({ url: request.url }, 'No index.html found for SPA fallback')
  return reply.status(404).send({ error: 'Not found' })
})

await app.listen({ port: config.port, host: config.host })

app.log.info(`Vigil running on http://${config.host}:${config.port}`)
app.log.info(`Data path: ${config.dataPath}`)
app.log.info(`Environment: ${config.nodeEnv}`)
app.log.info(`Log level: ${config.logLevel}`)
