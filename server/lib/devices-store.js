import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import config from '../config.js'

const FILE = join(config.dataPath, 'computers.json')

let _log = null

export function setStoreLogger(log) {
  _log = log
}

function log() {
  return _log ?? { info() {}, warn() {}, error() {}, debug() {} }
}

function readAll() {
  try {
    if (!existsSync(FILE)) {
      log().debug({ file: FILE }, 'Device store file not found, returning empty')
      return []
    }
    const raw = readFileSync(FILE, 'utf8')
    const devices = JSON.parse(raw)
    log().debug({ count: devices.length, file: FILE }, 'Device store read')
    return devices
  } catch (err) {
    log().warn({ err: err.message, file: FILE }, 'Failed to read device store, returning empty')
    return []
  }
}

function writeAll(devices) {
  const dir = config.dataPath
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = FILE + '.tmp'
  try {
    writeFileSync(tmp, JSON.stringify(devices, null, 2), 'utf8')
    renameSync(tmp, FILE)
    log().debug({ count: devices.length, file: FILE }, 'Device store written atomically')
  } catch (err) {
    log().error({ err: err.message, file: FILE }, 'Failed to write device store')
    throw err
  }
}

function getById(id) {
  return readAll().find(d => d.id === id) ?? null
}

function create(fields) {
  const devices = readAll()
  const device = {
    id: randomUUID(),
    name: fields.name || fields.host,
    group: fields.group ?? 'Default',
    host: fields.host,
    port: fields.port ?? (fields.tls ? 16993 : 16992),
    tls: fields.tls ?? false,
    username: fields.username ?? 'admin',
    password: fields.password ?? '',
  }
  devices.push(device)
  writeAll(devices)
  log().info({ deviceId: device.id, name: device.name, host: device.host, port: device.port, tls: device.tls }, 'Device created in store')
  return device
}

function update(id, fields) {
  const devices = readAll()
  const idx = devices.findIndex(d => d.id === id)
  if (idx === -1) return null
  const existing = devices[idx]
  if ('password' in fields && fields.password === '') {
    delete fields.password
  }
  devices[idx] = { ...existing, ...fields, id: existing.id }
  writeAll(devices)
  log().info({ deviceId: id, updatedFields: Object.keys(fields) }, 'Device updated in store')
  return devices[idx]
}

function remove(id) {
  const devices = readAll()
  const idx = devices.findIndex(d => d.id === id)
  if (idx === -1) return false
  const removed = devices[idx]
  devices.splice(idx, 1)
  writeAll(devices)
  log().info({ deviceId: id, name: removed.name, host: removed.host }, 'Device removed from store')
  return true
}

export default { readAll, writeAll, getById, create, update, remove }
