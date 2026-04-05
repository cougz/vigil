import store from '../lib/devices-store.js'
import { powerAction, getPowerState, POWER_STATES } from '../lib/wsman.js'

export default async function powerRoute(app) {
  app.get('/api/devices/:id/power', async (request, reply) => {
    const device = store.getById(request.params.id)
    if (!device) {
      request.log.warn({ id: request.params.id }, 'Power state requested for unknown device')
      return reply.status(404).send({ error: 'Device not found' })
    }
    request.log.info({ id: device.id, host: device.host }, 'Power state query')
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
    if (!device) {
      request.log.warn({ id: request.params.id }, 'Power action requested for unknown device')
      return reply.status(404).send({ error: 'Device not found' })
    }
    const action = request.body.action
    request.log.info({ id: device.id, host: device.host, action }, 'Power action requested')
    try {
      await powerAction(device, action, request.log)
      request.log.info({ id: device.id, host: device.host, action }, 'Power action succeeded')
      return { ok: true, action }
    } catch (err) {
      request.log.error({ err: err.message, id: device.id, host: device.host, action }, 'Power action failed')
      return reply.status(502).send({ error: err.message })
    }
  })
}
