import store from '../lib/devices-store.js'
import { createKvmTunnel } from '../lib/tunnel.js'

export default async function kvmRoute(app) {
  app.get('/ws/kvm/:id', { websocket: true }, (socket, request) => {
    const device = store.getById(request.params.id)
    if (!device) {
      request.log.warn({ id: request.params.id }, 'KVM tunnel requested for unknown device')
      socket.close(1008, 'Device not found')
      return
    }
    request.log.info({ deviceId: device.id, host: device.host, port: device.tls ? 16995 : 16994, name: device.name, tls: device.tls }, 'KVM tunnel opened')
    createKvmTunnel(socket, device, request.log)
  })
}
