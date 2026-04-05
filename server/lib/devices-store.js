import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import config from '../config.js'

const FILE = join(config.dataPath, 'computers.json')

function readAll() {
  try {
    if (!existsSync(FILE)) return []
    const raw = readFileSync(FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function writeAll(devices) {
  const dir = config.dataPath
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(devices, null, 2), 'utf8')
  renameSync(tmp, FILE)
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
  return devices[idx]
}

function remove(id) {
  const devices = readAll()
  const idx = devices.findIndex(d => d.id === id)
  if (idx === -1) return false
  devices.splice(idx, 1)
  writeAll(devices)
  return true
}

export default { readAll, writeAll, getById, create, update, remove }
