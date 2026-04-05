import * as net from 'net'
import * as tls from 'tls'

export function createKvmTunnel(ws, device, log) {
  const kvmPort = device.tls ? 16995 : 16994

  const connectOpts = {
    host: device.host,
    port: kvmPort,
  }

  const tcp = device.tls
    ? tls.connect({ ...connectOpts, rejectUnauthorized: false })
    : net.connect(connectOpts)

  log.info({ host: device.host, port: kvmPort, tls: device.tls }, 'KVM tunnel opening')

  tcp.on('data', (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(data, { binary: true })
    }
  })

  tcp.on('error', (err) => {
    log.error({ err: err.message, host: device.host }, 'KVM TCP error')
    if (ws.readyState === ws.OPEN) ws.close(1011, 'TCP error')
  })

  tcp.on('end', () => {
    log.info({ host: device.host }, 'KVM TCP ended')
    if (ws.readyState === ws.OPEN) ws.close(1000, 'TCP ended')
  })

  tcp.on('close', () => {
    log.info({ host: device.host }, 'KVM tunnel closed')
  })

  ws.on('message', (data) => {
    if (!tcp.destroyed) {
      tcp.write(Buffer.from(data))
    }
  })

  ws.on('close', () => {
    log.info({ host: device.host }, 'KVM WebSocket closed')
    if (!tcp.destroyed) tcp.destroy()
  })

  ws.on('error', (err) => {
    log.error({ err: err.message, host: device.host }, 'KVM WebSocket error')
    if (!tcp.destroyed) tcp.destroy()
  })

  return tcp
}
