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
  app.get('/api/devices', async () => {
    return store.readAll().map(stripPassword)
  })

  app.get('/api/devices/:id', async (request, reply) => {
    const device = store.getById(request.params.id)
    if (!device) return reply.status(404).send({ error: 'Device not found' })
    const powerState = await getPowerState(device, request.log)
    return { ...stripPassword(device), ...powerState }
  })

  app.post('/api/devices', { schema: { body: deviceSchema } }, async (request, reply) => {
    const device = store.create(request.body)
    request.log.info({ deviceId: device.id, host: device.host }, 'Device created')
    return reply.status(201).send(stripPassword(device))
  })

  app.put('/api/devices/:id', async (request, reply) => {
    const updated = store.update(request.params.id, request.body)
    if (!updated) return reply.status(404).send({ error: 'Device not found' })
    request.log.info({ deviceId: updated.id }, 'Device updated')
    return stripPassword(updated)
  })

  app.delete('/api/devices/:id', async (request, reply) => {
    const ok = store.remove(request.params.id)
    if (!ok) return reply.status(404).send({ error: 'Device not found' })
    request.log.info({ deviceId: request.params.id }, 'Device deleted')
    return reply.status(204).send()
  })
}
