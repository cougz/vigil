import { render, h } from 'preact'
import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import { Router, route } from 'preact-router'
import './styles/global.css'
import { api, kvmWsUrl } from './api'

function App() {
  const [devices, setDevices] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [toasts, setToasts] = useState([])
  const [currentUrl, setCurrentUrl] = useState('/')

  const addToast = useCallback((message, type = 'ok') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  const refreshDevices = useCallback(async () => {
    try {
      const list = await api.devices.list()
      setDevices(list)
    } catch {}
  }, [])

  useEffect(() => { refreshDevices() }, [refreshDevices])

  const activeId = currentUrl.match(/\/device\/([^/]+)/)?.[1]

  return (
    <div class="shell">
      <div class="topbar">
        <span class="topbar-logo">VIGIL</span>
      </div>
      <div class="sidebar">
        <div class="sidebar-list">
          {devices.map(d => {
            const dotClass = d.powerState === 2 ? 'dot-on' : (d.powerState === 6 || d.powerState === 8 || d.powerState === 9) ? 'dot-off' : 'dot-unknown'
            return (
              <div
                key={d.id}
                class={`device-item ${activeId === d.id ? 'active' : ''}`}
                onClick={() => route(`/device/${d.id}`)}
              >
                <span class={`device-dot ${dotClass}`} />
                <span class="device-name">{d.name}</span>
              </div>
            )
          })}
        </div>
        <div class="sidebar-footer">
          <button class="btn btn-primary" style="width:100%" onClick={() => setShowAddModal(true)}>
            + Add computer
          </button>
        </div>
      </div>
      <div class="main">
        <Router onChange={(e) => setCurrentUrl(e.url ?? '/')}>
          <Dashboard path="/" devices={devices} onAdd={() => setShowAddModal(true)} />
          <DeviceDetail path="/device/:id" addToast={addToast} onDeviceUpdated={refreshDevices} />
          <KvmView path="/device/:id/kvm" />
        </Router>
      </div>
      {showAddModal && (
        <AddDeviceModal
          onCreated={() => { refreshDevices(); setShowAddModal(false) }}
          onCancel={() => setShowAddModal(false)}
          addToast={addToast}
        />
      )}
      <div class="toast-container">
        {toasts.map(t => <div key={t.id} class={`toast toast-${t.type}`}>{t.message}</div>)}
      </div>
    </div>
  )
}

function Dashboard({ devices, onAdd }) {
  if (devices.length === 0) {
    return (
      <div class="empty-state">
        <p>No computers yet — add one to get started.</p>
        <button class="btn btn-primary" onClick={onAdd}>Add computer</button>
      </div>
    )
  }
  return (
    <div class="empty-state">
      <p>Select a computer from the sidebar to manage it.</p>
    </div>
  )
}

function DeviceDetail({ id, addToast, onDeviceUpdated }) {
  const [device, setDevice] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.devices.get(id)
      setDevice(data)
    } catch (err) {
      addToast(err.message, 'err')
    } finally {
      setLoading(false)
    }
  }, [id, addToast])

  useEffect(() => { load() }, [load])

  if (loading || !device) {
    return <div class="detail-loading">Loading…</div>
  }

  const isOn = device.powerState === 2
  const stateClass = isOn ? 'on' : (device.powerState === 6 || device.powerState === 8 || device.powerState === 9) ? 'off' : 'unknown'
  const dotClass = stateClass === 'on' ? 'dot-on' : stateClass === 'off' ? 'dot-off' : 'dot-unknown'

  const handleAction = async (actionKey) => {
    try {
      await api.power.action(id, actionKey)
      addToast(`${actionKey} sent`, 'ok')
      setTimeout(load, 2000)
    } catch (err) {
      addToast(err.message, 'err')
    }
  }

  return (
    <div>
      <div class="card">
        <div class="card-title">System Status</div>
        <table class="info-table">
          <tr><td>Power</td><td><span class={`power-badge ${stateClass}`}><span class={`device-dot ${dotClass}`} />{device.powerStateLabel ?? 'Unknown'}</span></td></tr>
          <tr><td>Name</td><td>{device.name}</td></tr>
          <tr><td>Host</td><td class="mono">{device.host}:{device.port}</td></tr>
          <tr><td>Auth</td><td>{device.tls ? 'Digest / TLS' : 'Digest'}</td></tr>
          <tr><td>Username</td><td>{device.username}</td></tr>
        </table>
        <div class="actions-row">
          <button class="btn btn-ghost" onClick={load}>Refresh</button>
          <button
            class="btn btn-primary"
            onClick={() => route(`/device/${id}/kvm`)}
            disabled={false}
            title="Open Remote Desktop session"
          >
            Remote Desktop
          </button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Power Actions</div>
        <PowerPanel deviceId={id} currentState={device.powerState} onAction={handleAction} />
      </div>
    </div>
  )
}

function PowerPanel({ deviceId, currentState, onAction }) {
  const [pending, setPending] = useState(null)
  const [confirmKey, setConfirmKey] = useState(null)

  const isOn = currentState === 2
  const isOff = currentState === 6 || currentState === 8 || currentState === 9

  const actions = [
    { key: 'on',         label: 'Power On',    icon: '\u23FB', disabled: isOn },
    { key: 'off',        label: 'Shutdown',    icon: '\u23FC', disabled: isOff },
    { key: 'off-hard',   label: 'Force Off',   icon: '\u2715', disabled: isOff, danger: true },
    { key: 'reset',      label: 'Restart',     icon: '\u21BA', disabled: isOff },
    { key: 'reset-hard', label: 'Force Reset', icon: '\u26A1', disabled: isOff, danger: true },
    { key: 'sleep',      label: 'Sleep',       icon: '\uD83C\uDF19', disabled: isOff },
    { key: 'hibernate',  label: 'Hibernate',   icon: '\uD83D\uDCA4', disabled: isOff },
  ]

  const handleClick = async (action) => {
    if (action.danger && confirmKey !== action.key) {
      setConfirmKey(action.key)
      setTimeout(() => setConfirmKey(null), 3000)
      return
    }
    setConfirmKey(null)
    setPending(action.key)
    try {
      await onAction(action.key)
    } finally {
      setPending(null)
    }
  }

  return (
    <div class="power-grid">
      {actions.map(a => (
        <button
          key={a.key}
          class={`power-btn ${a.danger ? 'danger-action' : ''}`}
          disabled={a.disabled || (pending !== null && pending !== a.key)}
          onClick={() => handleClick(a)}
        >
          {pending === a.key
            ? <span class="spinner" style="align-self:center" />
            : <span class="icon">{confirmKey === a.key ? '?' : a.icon}</span>
          }
          <span>{confirmKey === a.key ? 'Confirm?' : a.label}</span>
        </button>
      ))}
    </div>
  )
}

function AddDeviceModal({ onCreated, onCancel, addToast }) {
  const [form, setForm] = useState({
    name: '',
    group: 'Default',
    host: '',
    port: 16992,
    tls: false,
    username: 'admin',
    password: '',
  })
  const [error, setError] = useState('')
  const [hostError, setHostError] = useState(false)

  const set = (key, val) => {
    setForm(prev => {
      const next = { ...prev, [key]: val }
      if (key === 'tls') next.port = val ? 16993 : 16992
      return next
    })
    if (key === 'host') setHostError(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.host.trim()) { setHostError(true); return }
    try {
      await api.devices.create(form)
      addToast('Device added', 'ok')
      onCreated()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div class="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div class="modal">
        <h2>Add Computer</h2>
        <form onSubmit={submit}>
          <div class="form-group">
            <label>Friendly Name</label>
            <input type="text" placeholder="Optional" value={form.name} onInput={e => set('name', e.target.value)} />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Group</label>
              <input type="text" value={form.group} onInput={e => set('group', e.target.value)} />
            </div>
            <div class="form-group">
              <label>Hostname</label>
              <input type="text" class={hostError ? 'field-error' : ''} placeholder="Required" value={form.host} onInput={e => set('host', e.target.value)} />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Auth / Security</label>
              <select value={form.tls ? 'tls' : 'digest'} onChange={e => set('tls', e.target.value === 'tls')}>
                <option value="digest">Digest</option>
                <option value="tls">Digest / TLS</option>
              </select>
            </div>
            <div class="form-group">
              <label>Port</label>
              <input type="number" value={form.port} onInput={e => set('port', parseInt(e.target.value) || 16992)} />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Username</label>
              <input type="text" value={form.username} onInput={e => set('username', e.target.value)} />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" value={form.password} onInput={e => set('password', e.target.value)} />
            </div>
          </div>
          {error && <div class="error-text">{error}</div>}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" class="btn btn-primary">Add</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function KvmView({ id }) {
  const containerRef = useRef(null)
  const rfbRef = useRef(null)
  const [status, setStatus] = useState('connecting')
  const [deviceName, setDeviceName] = useState('')

  useEffect(() => {
    let rfb = null
    let destroyed = false

    const init = async () => {
      try {
        const device = await api.devices.get(id)
        if (!destroyed) setDeviceName(device.name)
      } catch {}

      const RFB = (await import('@novnc/novnc/lib/rfb.js')).default
      if (destroyed) return

      const container = containerRef.current
      if (!container) return

      const url = kvmWsUrl(id)
      rfb = new RFB(container, url)
      rfb.scaleViewport = true
      rfb.resizeSession = false

      rfb.addEventListener('connect', () => { if (!destroyed) setStatus('connected') })
      rfb.addEventListener('disconnect', () => { if (!destroyed) setStatus('disconnected') })
      rfb.addEventListener('credentialsrequired', () => {
        const password = prompt('VNC password (leave blank if not set):') ?? ''
        if (rfb) rfb.sendCredentials({ password })
      })

      rfbRef.current = rfb
    }

    init()
    return () => {
      destroyed = true
      if (rfb) rfb.disconnect()
    }
  }, [id])

  const sendCtrlAltDel = () => {
    if (rfbRef.current) rfbRef.current.sendCtrlAltDel()
  }

  const goFullscreen = () => {
    const el = containerRef.current?.parentElement
    if (el?.requestFullscreen) el.requestFullscreen()
  }

  return (
    <div class="kvm-view">
      <div class="kvm-toolbar">
        <button class="btn btn-ghost" onClick={() => route(`/device/${id}`)}>← Back</button>
        <span class="mono" style="font-size:13px">{deviceName}</span>
        <span class={`kvm-status ${status}`}>
          {status === 'connecting' ? 'Connecting\u2026' : status === 'connected' ? 'Connected' : 'Disconnected'}
        </span>
        <div style="flex:1" />
        <button class="btn btn-ghost" onClick={sendCtrlAltDel}>Ctrl+Alt+Del</button>
        <button class="btn btn-ghost" onClick={goFullscreen}>Fullscreen</button>
      </div>
      <div class="kvm-canvas-wrap">
        <div ref={containerRef} />
      </div>
    </div>
  )
}

render(<App />, document.getElementById('app'))
