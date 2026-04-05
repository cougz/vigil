import store from '../lib/devices-store.js'
import { getPowerState } from '../lib/wsman.js'

function stripPassword(device) {
  if (!device) return device
  const { password, ...rest } = device
  return rest
}

const deviceSchema = {
  type: 'object',
  required: ['host'],
  properties: {
    name:     { type: 'string' },
    group:    { type: 'string' },
    host:     { type: 'string', minLength: 1 },
    port:     { type: 'integer' },
    tls:      { type: 'boolean' },
    username: { type: 'string' },
    password: { type: 'string' },
  },
}

export default async function devicesRoute(app) {
  app.get('/api/devices', async (request) => {
    const devices = store.readAll()
    request.log.debug({ count: devices.length }, 'Listing all devices')
    return devices.map(stripPassword)
  })

  app.get('/api/devices/:id', async (request, reply) => {
    const device = store.getById(request.params.id)
    if (!device) {
      request.log.warn({ id: request.params.id }, 'Device not found')
      return reply.status(404).send({ error: 'Device not found' })
    }
    request.log.info({ id: device.id, host: device.host }, 'Fetching device detail with live power state')
    const powerState = await getPowerState(device, request.log)
    return { ...stripPassword(device), ...powerState }
  })

  app.post('/api/devices', { schema: { body: deviceSchema } }, async (request, reply) => {
    request.log.info({ host: request.body.host, name: request.body.name }, 'Creating device')
    const device = store.create(request.body)
    return reply.status(201).send(stripPassword(device))
  })

  app.put('/api/devices/:id', async (request, reply) => {
    const updated = store.update(request.params.id, request.body)
    if (!updated) {
      request.log.warn({ id: request.params.id }, 'Device not found for update')
      return reply.status(404).send({ error: 'Device not found' })
    }
    return stripPassword(updated)
  })

  app.delete('/api/devices/:id', async (request, reply) => {
    const ok = store.remove(request.params.id)
    if (!ok) {
      request.log.warn({ id: request.params.id }, 'Device not found for deletion')
      return reply.status(404).send({ error: 'Device not found' })
    }
    return reply.status(204).send()
  })
}
