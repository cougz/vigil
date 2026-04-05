import * as net from 'net'
import * as tls from 'tls'

export function createKvmTunnel(ws, device, log) {
  const kvmPort = device.tls ? 16995 : 16994
  const target = `${device.host}:${kvmPort}`

  log.info({ host: device.host, port: kvmPort, tls: device.tls, deviceId: device.id, name: device.name }, 'KVM tunnel opening TCP connection')

  const connectOpts = {
    host: device.host,
    port: kvmPort,
  }

  const tcp = device.tls
    ? tls.connect({ ...connectOpts, rejectUnauthorized: false })
    : net.connect(connectOpts)

  let bytesUp = 0
  let bytesDown = 0

  tcp.on('connect', () => {
    log.info({ target, tls: device.tls }, 'KVM TCP connection established')
  })

  tcp.on('data', (data) => {
    bytesDown += data.length
    if (ws.readyState === ws.OPEN) {
      ws.send(data, { binary: true })
    } else {
      log.warn({ target, dataLength: data.length, readyState: ws.readyState }, 'KVM TCP data received but WebSocket not open')
    }
  })

  tcp.on('error', (err) => {
    log.error({ err: err.message, code: err.code, target }, 'KVM TCP connection error')
    if (ws.readyState === ws.OPEN) ws.close(1011, 'TCP error')
  })

  tcp.on('end', () => {
    log.info({ target, bytesUp, bytesDown }, 'KVM TCP connection ended by remote')
    if (ws.readyState === ws.OPEN) ws.close(1000, 'TCP ended')
  })

  tcp.on('close', () => {
    log.info({ target, bytesUp, bytesDown, deviceId: device.id }, 'KVM tunnel TCP socket closed')
  })

  ws.on('message', (data) => {
    const buf = Buffer.from(data)
    bytesUp += buf.length
    if (!tcp.destroyed) {
      tcp.write(buf)
    } else {
      log.warn({ target, dataLength: buf.length }, 'KVM WebSocket message received but TCP socket destroyed')
    }
  })

  ws.on('close', (code, reason) => {
    log.info({ target, code, reason: reason?.toString(), bytesUp, bytesDown, deviceId: device.id }, 'KVM WebSocket closed')
    if (!tcp.destroyed) tcp.destroy()
  })

  ws.on('error', (err) => {
    log.error({ err: err.message, target, deviceId: device.id }, 'KVM WebSocket error')
    if (!tcp.destroyed) tcp.destroy()
  })

  return tcp
}
