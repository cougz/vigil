import store from '../lib/devices-store.js'
import { powerAction, getPowerState, POWER_STATES } from '../lib/wsman.js'

export default async function powerRoute(app) {
  app.get('/api/devices/:id/power', async (request, reply) => {
    const device = store.getById(request.params.id)
    if (!device) return reply.status(404).send({ error: 'Device not found' })
    return getPowerState(device, request.log)
  })

  const actionSchema = {
    type: 'object',
    required: ['action'],
    properties: {
      action: { type: 'string', enum: Object.keys(POWER_STATES) },
    },
  }

  app.post('/api/devices/:id/power', { schema: { body: actionSchema } }, async (request, reply) => {
    const device = store.getById(request.params.id)
    if (!device) return reply.status(404).send({ error: 'Device not found' })
    try {
      await powerAction(device, request.body.action, request.log)
      request.log.info({ deviceId: device.id, action: request.body.action }, 'Power action dispatched')
      return { ok: true, action: request.body.action }
    } catch (err) {
      request.log.error({ err: err.message, deviceId: device.id }, 'Power action failed')
      return reply.status(502).send({ error: err.message })
    }
  })
}
