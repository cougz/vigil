import { createHash, randomBytes } from 'crypto'
import { randomUUID } from 'crypto'
import tls from 'node:tls'

const origCheck = tls.checkServerIdentity
tls.checkServerIdentity = function (...args) {
  try { return origCheck(...args) } catch { return undefined }
}

export const POWER_STATES = {
  on: 2,
  sleep: 4,
  'off-hard': 9,
  'reset-hard': 5,
  hibernate: 7,
  off: 8,
  reset: 10,
}

const POWER_STATE_LABELS = {
  2: 'On',
  3: 'Sleep – Light',
  4: 'Sleep – Deep',
  5: 'Power Cycle – Hard',
  6: 'Off – Hard',
  7: 'Hibernate',
  8: 'Off – Soft',
  9: 'Off – Hard',
  10: 'Reset – Soft',
}

function buildEnvelope(action, resourceUri, selectorSet, body) {
  let selectorXml = ''
  if (selectorSet) {
    selectorXml = '<wsman:SelectorSet>'
    for (const s of selectorSet) {
      selectorXml += `<wsman:Selector Name="${s.name}">${s.value}</wsman:Selector>`
    }
    selectorXml += '</wsman:SelectorSet>'
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:wsman="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd" xmlns:cim="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/">
  <s:Header>
    <wsa:Action s:mustUnderstand="true">${action}</wsa:Action>
    <wsa:To s:mustUnderstand="true">/wsman</wsa:To>
    <wsman:ResourceURI s:mustUnderstand="true">${resourceUri}</wsman:ResourceURI>
    <wsa:MessageID s:mustUnderstand="true">uuid:${randomUUID()}</wsa:MessageID>
    <wsa:ReplyTo><wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo>
    ${selectorXml}
  </s:Header>
  <s:Body>${body}</s:Body>
</s:Envelope>`
}

function parseDigestChallenge(wwwAuth) {
  const params = {}
  const regex = /(\w+)="([^"]*)"/g
  let m
  while ((m = regex.exec(wwwAuth)) !== null) {
    params[m[1]] = m[2]
  }
  if (wwwAuth.includes('qop=') && !params.qop) {
    const qopMatch = wwwAuth.match(/qop=(\w+)/)
    if (qopMatch) params.qop = qopMatch[1]
  }
  if (params.qop) {
    const qopOptions = params.qop.split(',').map(s => s.trim())
    params.qop = qopOptions.includes('auth') ? 'auth' : qopOptions[0]
  }
  return params
}

function md5(str) {
  return createHash('md5').update(str).digest('hex')
}

function buildAuthHeader(username, password, method, uri, challenge) {
  const ha1 = md5(`${username}:${challenge.realm}:${password}`)
  const ha2 = md5(`${method}:${uri}`)
  const nc = '00000001'
  const cnonce = randomBytes(8).toString('hex')

  let response
  if (challenge.qop) {
    response = md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`)
  } else {
    response = md5(`${ha1}:${challenge.nonce}:${ha2}`)
  }

  let header = `Digest username="${username}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}", response="${response}"`
  if (challenge.qop) header += `, qop=${challenge.qop}, nc=${nc}, cnonce="${cnonce}"`
  if (challenge.opaque) header += `, opaque="${challenge.opaque}"`
  return header
}

async function wsmanPost(device, soapBody, log) {
  const protocol = device.tls ? 'https' : 'http'
  const url = `${protocol}://${device.host}:${device.port}/wsman`

  const headers = {
    'Content-Type': 'application/soap+xml; charset=UTF-8',
  }

  log.info({ url, host: device.host, port: device.port, tls: device.tls }, 'WS-MAN request sending (unauthenticated)')

  const res1 = await fetch(url, {
    method: 'POST',
    headers,
    body: soapBody,
    signal: AbortSignal.timeout(8000),
  }).catch(err => {
    log.error({ err: err.message, host: device.host, port: device.port }, 'WS-MAN connection failed')
    throw new Error(`Connection to ${device.host}:${device.port} failed: ${err.message}`)
  })

  log.debug({ status: res1.status, host: device.host }, 'WS-MAN initial response status')

  if (res1.status !== 401) {
    const text = await res1.text()
    if (!res1.ok) {
      log.error({ status: res1.status, host: device.host, body: text.substring(0, 500) }, 'WS-MAN unexpected non-401 error')
      throw new Error(`WS-MAN returned HTTP ${res1.status}`)
    }
    log.info({ host: device.host, responseLength: text.length }, 'WS-MAN succeeded without digest auth')
    return text
  }

  log.info({ host: device.host }, 'WS-MAN got 401, performing Digest auth handshake')

  const wwwAuth = res1.headers.get('www-authenticate') ?? ''
  const challenge = parseDigestChallenge(wwwAuth)
  log.debug({ challenge, host: device.host }, 'WS-MAN digest challenge parsed')

  const authHeader = buildAuthHeader(device.username, device.password, 'POST', '/wsman', challenge)
  log.debug({ host: device.host }, 'WS-MAN built Authorization header')
  headers.Authorization = authHeader

  log.info({ url, host: device.host }, 'WS-MAN request sending (authenticated)')

  const res2 = await fetch(url, {
    method: 'POST',
    headers,
    body: soapBody,
    signal: AbortSignal.timeout(8000),
  }).catch(err => {
    log.error({ err: err.message, host: device.host }, 'WS-MAN authenticated request failed')
    throw new Error(`Authenticated request to ${device.host}:${device.port} failed: ${err.message}`)
  })

  const text = await res2.text()
  if (!res2.ok) {
    log.error({ status: res2.status, host: device.host, body: text.substring(0, 2000) }, 'WS-MAN authenticated request returned error')
    throw new Error(`WS-MAN returned HTTP ${res2.status}: ${text.substring(0, 200)}`)
  }

  log.info({ host: device.host, responseLength: text.length }, 'WS-MAN authenticated request succeeded')
  log.debug({ responseXml: text, host: device.host }, 'WS-MAN full response XML')
  return text
}

function parseReturnValue(xml) {
  const match = xml.match(/<\w+:ReturnValue[^>]*>(\d+)<\/\w+:ReturnValue>/)
  return match ? parseInt(match[1], 10) : null
}

export async function powerAction(device, actionKey, log) {
  const stateInt = POWER_STATES[actionKey]
  if (stateInt === undefined) throw new Error(`Unknown power action: ${actionKey}`)

  log.info({ host: device.host, action: actionKey, stateInt }, 'Dispatching power action to AMT device')

  const action = 'http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_PowerManagementService/RequestPowerStateChange'
  const resourceUri = 'http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_PowerManagementService'

  const selectorSet = [
    { name: 'Name', value: 'Intel(r) AMT Power Management Service' },
    { name: 'SystemCreationClassName', value: 'CIM_ComputerSystem' },
    { name: 'SystemName', value: 'Intel(r) AMT' },
    { name: 'CreationClassName', value: 'CIM_PowerManagementService' },
  ]

  const body = `<cim:RequestPowerStateChange_INPUT xmlns:cim="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_PowerManagementService">
    <cim:PowerState>${stateInt}</cim:PowerState>
    <cim:ManagedElement>
      <wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address>
      <wsa:ReferenceParameters>
        <wsman:ResourceURI>http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ComputerSystem</wsman:ResourceURI>
        <wsman:SelectorSet>
          <wsman:Selector Name="Name">Intel(r) AMT</wsman:Selector>
          <wsman:Selector Name="CreationClassName">CIM_ComputerSystem</wsman:Selector>
        </wsman:SelectorSet>
      </wsa:ReferenceParameters>
    </cim:ManagedElement>
  </cim:RequestPowerStateChange_INPUT>`

  const soap = buildEnvelope(action, resourceUri, selectorSet, body)
  log.debug({ soap, host: device.host }, 'Power action SOAP envelope')

  const responseXml = await wsmanPost(device, soap, log)

  const rv = parseReturnValue(responseXml)
  if (rv === null) {
    log.error({ host: device.host, responseXml: responseXml.substring(0, 1000) }, 'Could not parse ReturnValue from WS-MAN response')
    throw new Error('Could not parse ReturnValue from WS-MAN response')
  }
  if (rv !== 0) {
    const msgs = { 2: 'Not ready – machine is mid-transition' }
    const msg = msgs[rv] ?? `AMT returned error code ${rv}`
    log.error({ host: device.host, action: actionKey, returnValue: rv }, `Power action failed: ${msg}`)
    throw new Error(msg)
  }

  log.info({ host: device.host, action: actionKey, returnValue: rv }, 'Power action completed successfully')
  return { ok: true }
}

export async function getPowerState(device, log) {
  log.info({ host: device.host }, 'Querying power state from AMT device')

  const action = 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Get'
  const resourceUri = 'http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_AssociatedPowerManagementService'

  const soap = buildEnvelope(action, resourceUri, null, '')
  try {
    const responseXml = await wsmanPost(device, soap, log)
    const match = responseXml.match(/<\w+:PowerState[^>]*>(\d+)<\/\w+:PowerState>/)
    if (match) {
      const state = parseInt(match[1], 10)
      const label = POWER_STATE_LABELS[state] ?? 'Unknown'
      log.info({ host: device.host, powerState: state, powerStateLabel: label }, 'Power state retrieved')
      return { powerState: state, powerStateLabel: label }
    }
    log.warn({ host: device.host }, 'Could not parse PowerState from response, returning Unknown')
    return { powerState: 0, powerStateLabel: 'Unknown' }
  } catch (err) {
    log.warn({ err: err.message, host: device.host }, 'Failed to get power state from device')
    return { powerState: 0, powerStateLabel: 'Unknown' }
  }
}
