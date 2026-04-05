import * as net from 'net'
import * as tls from 'tls'
import { createHash, randomBytes } from 'crypto'

function md5hex(str) {
  return createHash('md5').update(str).digest('hex')
}

export function createKvmTunnel(ws, device, log) {
  const kvmPort = device.tls ? 16995 : 16994
  const target = `${device.host}:${kvmPort}`
  const authUri = '/RedirectionService'

  log.info({ host: device.host, port: kvmPort, tls: device.tls, deviceId: device.id, name: device.name }, 'KVM tunnel opening TCP connection')

  let acc = Buffer.alloc(0)
  let state = 0
  let bytesUp = 0
  let bytesDown = 0
  let tcp = null

  const connectOpts = {
    host: device.host,
    port: kvmPort,
    rejectUnauthorized: false,
  }

  if (device.tls) {
    tcp = tls.connect({ ...connectOpts, ciphers: 'RSA+AES:!aNULL:!MD5:!DSS', minVersion: 'TLSv1' })
  } else {
    tcp = net.connect(connectOpts)
  }

  tcp.on('connect', () => {
    log.info({ target, tls: device.tls }, 'KVM TCP connection established, sending StartRedirectionSession')
    state = 1
    tcp.write(Buffer.from([0x10, 0x01, 0x00, 0x00, 0x4B, 0x56, 0x4D, 0x52]))
  })

  tcp.on('data', (data) => {
    if (state === 4) {
      bytesDown += data.length
      if (ws.readyState === ws.OPEN) {
        ws.send(data, { binary: true })
      }
      return
    }
    acc = Buffer.concat([acc, data])
    processAccumulator()
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

  function readInt32LE(buf, off) {
    return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] * 0x1000000)
  }

  function processAccumulator() {
    while (acc.length > 0) {
      const cmd = acc[0]
      let cmdsize = 0

      switch (cmd) {
        case 0x11: {
          if (acc.length < 13) return
          const oemLen = acc[12]
          cmdsize = 13 + oemLen
          if (acc.length < cmdsize) return
          log.info({ target }, 'KVM got StartRedirectionSessionReply, querying auth methods')
          tcp.write(Buffer.from([0x13, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))
          break
        }

        case 0x14: {
          if (acc.length < 9) return
          const authDataLen = readInt32LE(acc, 5)
          cmdsize = 9 + authDataLen
          if (acc.length < cmdsize) return
          const status = acc[1]
          const authType = acc[4]
          const authData = acc.slice(9, 9 + authDataLen)

          if (authType === 0) {
            log.info({ target, methods: Array.from(authData) }, 'KVM auth methods available')
            let chosenType = 4
            if (!authData.includes(4) && authData.includes(3)) chosenType = 3
            if (!authData.includes(4) && !authData.includes(3) && authData.includes(1)) chosenType = 1

            if (chosenType === 4 || chosenType === 3) {
              const user = Buffer.from(device.username, 'binary')
              const uri = Buffer.from(authUri, 'binary')
              const totalLen = user.length + uri.length + 8
              tcp.write(Buffer.concat([
                Buffer.from([0x13, 0x00, 0x00, 0x00, chosenType]),
                Buffer.from([totalLen & 0xFF, (totalLen >> 8) & 0xFF, 0x00, 0x00]),
                Buffer.from([user.length]), user,
                Buffer.from([0x00, 0x00]),
                Buffer.from([uri.length]), uri,
                Buffer.from([0x00, 0x00, 0x00, 0x00]),
              ]))
              log.info({ target, authType: chosenType }, 'KVM selected digest auth, sending credentials')
            } else if (chosenType === 1) {
              const user = Buffer.from(device.username, 'binary')
              const pass = Buffer.from(device.password, 'binary')
              const totalLen = user.length + pass.length + 2
              tcp.write(Buffer.concat([
                Buffer.from([0x13, 0x00, 0x00, 0x00, 0x01]),
                Buffer.from([totalLen & 0xFF, (totalLen >> 8) & 0xFF, 0x00, 0x00]),
                Buffer.from([user.length]), user,
                Buffer.from([pass.length]), pass,
              ]))
              log.info({ target }, 'KVM selected basic auth')
            }
          } else if ((authType === 4 || authType === 3) && status === 1) {
            let ptr = 0
            const realmLen = authData[ptr]; ptr++
            const realm = authData.slice(ptr, ptr + realmLen).toString(); ptr += realmLen
            const nonceLen = authData[ptr]; ptr++
            const nonce = authData.slice(ptr, ptr + nonceLen).toString(); ptr += nonceLen
            let qop = 'auth'
            if (authType === 4 && ptr < authData.length) {
              const qopLen = authData[ptr]; ptr++
              qop = authData.slice(ptr, ptr + qopLen).toString(); ptr += qopLen
            }

            const cnonce = randomBytes(16).toString('hex')
            const snc = '00000002'
            const ha1 = md5hex(`${device.username}:${realm}:${device.password}`)
            const ha2 = md5hex(`POST:${authUri}`)
            let response
            if (authType === 4) {
              response = md5hex(`${ha1}:${nonce}:${snc}:${cnonce}:${qop}:${ha2}`)
            } else {
              response = md5hex(`${ha1}:${nonce}:${ha2}`)
            }

            log.info({ target, authType, realm, nonceLen: nonce.length }, 'KVM digest challenge received, computing response')

            const userBuf = Buffer.from(device.username)
            const realmBuf = Buffer.from(realm)
            const nonceBuf = Buffer.from(nonce)
            const uriBuf = Buffer.from(authUri)
            const cnonceBuf = Buffer.from(cnonce)
            const sncBuf = Buffer.from(snc)
            const digestBuf = Buffer.from(response)

            let totalLen = userBuf.length + realmBuf.length + nonceBuf.length +
              uriBuf.length + cnonceBuf.length + sncBuf.length + digestBuf.length + 7
            const parts = [
              Buffer.from([0x13, 0x00, 0x00, 0x00, authType]),
              Buffer.from([totalLen & 0xFF, (totalLen >> 8) & 0xFF, 0x00, 0x00]),
              Buffer.from([userBuf.length]), userBuf,
              Buffer.from([realmBuf.length]), realmBuf,
              Buffer.from([nonceBuf.length]), nonceBuf,
              Buffer.from([uriBuf.length]), uriBuf,
              Buffer.from([cnonceBuf.length]), cnonceBuf,
              Buffer.from([sncBuf.length]), sncBuf,
              Buffer.from([digestBuf.length]), digestBuf,
            ]
            if (authType === 4) {
              const qopBuf = Buffer.from(qop)
              totalLen += qopBuf.length + 1
              parts[1] = Buffer.from([totalLen & 0xFF, (totalLen >> 8) & 0xFF, 0x00, 0x00])
              parts.push(Buffer.from([qopBuf.length]), qopBuf)
            }
            tcp.write(Buffer.concat(parts))
          } else if (status === 0) {
            log.info({ target }, 'KVM auth succeeded, opening KVM channel')
            state = 3
            tcp.write(Buffer.from([0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))
          } else {
            log.error({ target, status, authType }, 'KVM unexpected auth status')
          }
          break
        }

        case 0x41: {
          if (acc.length < 8) return
          cmdsize = 8
          state = 4
          log.info({ target }, 'KVM channel opened, switching to raw RFB relay')
          if (acc.length > 8) {
            const rfbData = acc.slice(8)
            bytesDown += rfbData.length
            if (ws.readyState === ws.OPEN) ws.send(rfbData, { binary: true })
          }
          break
        }

        default: {
          log.warn({ target, cmd: cmd.toString(16), accLen: acc.length }, 'KVM unknown AMT command')
          return
        }
      }

      if (cmdsize === 0) return
      acc = acc.slice(cmdsize)
    }
  }

  return tcp
}
