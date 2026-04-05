export function kvmWsUrl(id) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws/kvm/${id}`
}

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(path, opts)
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) {
    throw new Error(data?.error ?? `HTTP ${res.status}`)
  }
  return data
}

export const api = {
  devices: {
    list:   ()       => request('GET', '/api/devices'),
    get:    (id)     => request('GET', `/api/devices/${id}`),
    create: (body)   => request('POST', '/api/devices', body),
    update: (id, body) => request('PUT', `/api/devices/${id}`, body),
    remove: (id)     => request('DELETE', `/api/devices/${id}`),
  },
  power: {
    state:  (id)     => request('GET', `/api/devices/${id}/power`),
    action: (id, action) => request('POST', `/api/devices/${id}/power`, { action }),
  },
}
