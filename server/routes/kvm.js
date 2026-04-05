import store from '../lib/devices-store.js'
import { createKvmTunnel } from '../lib/tunnel.js'

export default async function kvmRoute(app) {
  app.get('/ws/kvm/:id', { websocket: true }, (socket, request) => {
    const device = store.getById(request.params.id)
    if (!device) {
      socket.close(1008, 'Device not found')
      return
    }
    request.log.info({ deviceId: device.id, host: device.host, name: device.name }, 'KVM tunnel opened')
    createKvmTunnel(socket, device, request.log)
  })
}
