import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Site = {
  id: string
  url: string
  name: string
  color: string
  iconUrl: string | null
  displayMode: 'auto' | 'icon' | 'text'
}

const STORAGE_KEY = 'chromehome.sites.v1'
const COLS = 5
const PRESET_COLORS = ['#4A7DFF', '#00E9FF', '#9259FF', '#FF4A7A', '#FFB020', '#2BD576', '#2E7DFF']

function loadSitesFromStorage(): Site[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => item as Partial<Site>)
      .filter((s) => typeof s?.id === 'string' && typeof s?.url === 'string' && typeof s?.name === 'string')
      .map((s) => {
        const displayMode = s.displayMode === 'auto' || s.displayMode === 'icon' || s.displayMode === 'text' ? s.displayMode : 'auto'
        const iconUrl =
          typeof s.iconUrl === 'string'
            ? s.iconUrl
            : (() => {
                try {
                  const parsed = new URL(s.url!)
                  const origin = parsed.origin
                  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(origin)}&sz=128`
                } catch {
                  return null
                }
              })()
        return {
          id: s.id!,
          url: s.url!,
          name: s.name!,
          color: typeof s.color === 'string' ? s.color : PRESET_COLORS[0]!,
          iconUrl,
          displayMode,
        }
      })
  } catch {
    return []
  }
}

function normalizeUrl(raw: string) {
  const value = raw.trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

function truncateLabel(text: string, maxChars: number) {
  const chars = Array.from(text.trim())
  if (chars.length <= maxChars) return chars.join('')
  return `${chars.slice(0, maxChars).join('')}...`
}

function getInitial(name: string, url: string) {
  const nameTrimmed = name.trim()
  if (nameTrimmed) return Array.from(nameTrimmed)[0] ?? '?'
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '')
    return host[0]?.toUpperCase() ?? '?'
  } catch {
    return '?'
  }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getFaviconUrl(url: string) {
  try {
    const parsed = new URL(url)
    const origin = parsed.origin
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(origin)}&sz=128`
  } catch {
    return null
  }
}

function App() {
  const [sites, setSites] = useState<Site[]>(() => loadSitesFromStorage())
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null)
  const [draftUrl, setDraftUrl] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState(PRESET_COLORS[0]!)
  const [draftDisplayMode, setDraftDisplayMode] = useState<'auto' | 'icon' | 'text'>('auto')
  const [iconErrorById, setIconErrorById] = useState<Record<string, true>>({})
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sites))
    } catch {
      // ignore
    }
  }, [sites])

  const canSave = useMemo(() => {
    const url = normalizeUrl(draftUrl)
    const name = draftName.trim()
    if (!url || !name) return false
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }, [draftName, draftUrl])

  function closeAdd() {
    setIsAddOpen(false)
    setDraftUrl('')
    setDraftName('')
    setDraftColor(PRESET_COLORS[0]!)
    setDraftDisplayMode('auto')
  }

  function addSite() {
    const url = normalizeUrl(draftUrl)
    const name = draftName.trim()
    if (!url || !name) return
    let validUrl = ''
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
      validUrl = parsed.toString()
    } catch {
      return
    }

    setSites((prev) => [
      ...prev,
      {
        id: createId(),
        url: validUrl,
        name,
        color: draftColor,
        iconUrl: getFaviconUrl(validUrl),
        displayMode: draftDisplayMode,
      },
    ])
    closeAdd()
  }

  function removeSite(id: string) {
    setSites((prev) => prev.filter((s) => s.id !== id))
    setDeleteArmedId(null)
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function armDeleteWithLongPress(id: string) {
    longPressTriggeredRef.current = false
    clearLongPressTimer()
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true
      setDeleteArmedId(id)
    }, 480)
  }

  function cancelLongPress() {
    clearLongPressTimer()
  }

  function markIconError(id: string) {
    setIconErrorById((prev) => {
      if (prev[id]) return prev
      return { ...prev, [id]: true }
    })
  }

  return (
    <div
      className="app"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setDeleteArmedId(null)
      }}
    >
      <div
        className="gridWrap"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setDeleteArmedId(null)
        }}
      >
        <main className="grid" aria-label="主页快捷方式" style={{ ['--cols' as never]: COLS }}>
          {sites.map((site) => {
            const label = truncateLabel(site.name, 4)
            const initial = getInitial(site.name, site.url)
            const isArmed = deleteArmedId === site.id
            const preferText = site.displayMode === 'text'
            const canTryIcon = !preferText && !!site.iconUrl
            const iconFailed = !!iconErrorById[site.id]
            const showIcon = canTryIcon && !iconFailed

            return (
              <a
                key={site.id}
                className="tile"
                href={site.url}
                onContextMenu={(e) => e.preventDefault()}
                onClick={(e) => {
                  if (longPressTriggeredRef.current) {
                    e.preventDefault()
                    longPressTriggeredRef.current = false
                    return
                  }
                  if (deleteArmedId) {
                    e.preventDefault()
                  }
                }}
                onPointerDown={() => armDeleteWithLongPress(site.id)}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
              >
                <div className="icon" style={{ background: site.color }}>
                  {showIcon ? (
                    <img className="iconImg" src={site.iconUrl ?? undefined} alt="" loading="lazy" onError={() => markIconError(site.id)} />
                  ) : (
                    <span className="iconText">{initial}</span>
                  )}
                  {isArmed ? (
                    <button
                      type="button"
                      className="deleteBtn"
                      aria-label={`删除 ${site.name}`}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        removeSite(site.id)
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <div className="label">{label}</div>
              </a>
            )
          })}
        </main>
      </div>

      <button
        type="button"
        className="fab"
        aria-label="添加网站"
        onClick={() => {
          setDeleteArmedId(null)
          setIsAddOpen(true)
        }}
      >
        +
      </button>

      {isAddOpen ? (
        <div
          className="modalOverlay"
          role="presentation"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) closeAdd()
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label="添加网站">
            <div className="modalHeader">
              <div className="modalTitle">添加网站</div>
              <button type="button" className="modalClose" aria-label="关闭" onClick={closeAdd}>
                ×
              </button>
            </div>

            <div className="form">
              <label className="field">
                <div className="fieldLabel">URL</div>
                <input
                  className="input"
                  inputMode="url"
                  placeholder="https://example.com"
                  value={draftUrl}
                  onChange={(e) => setDraftUrl(e.target.value)}
                />
              </label>

              <label className="field">
                <div className="fieldLabel">网站名</div>
                <input className="input" placeholder="最多显示 4 个字" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
              </label>

              <div className="field">
                <div className="fieldLabel">图标背景色</div>
                <div className="swatches" role="list">
                  {PRESET_COLORS.map((color) => {
                    const active = color.toLowerCase() === draftColor.toLowerCase()
                    return (
                      <button
                        key={color}
                        type="button"
                        className={active ? 'swatch swatch--active' : 'swatch'}
                        style={{ background: color }}
                        aria-label={color}
                        onClick={() => setDraftColor(color)}
                      />
                    )
                  })}
                </div>
                <div className="colorRow">
                  <input className="color" type="color" value={draftColor} onChange={(e) => setDraftColor(e.target.value)} />
                  <div className="colorValue">{draftColor.toUpperCase()}</div>
                </div>
              </div>

              <div className="field">
                <div className="fieldLabel">显示方式</div>
                <div className="modeGroup" role="radiogroup" aria-label="显示方式">
                  <button
                    type="button"
                    className={draftDisplayMode === 'auto' ? 'modeBtn modeBtn--active' : 'modeBtn'}
                    role="radio"
                    aria-checked={draftDisplayMode === 'auto'}
                    onClick={() => setDraftDisplayMode('auto')}
                  >
                    自动
                  </button>
                  <button
                    type="button"
                    className={draftDisplayMode === 'icon' ? 'modeBtn modeBtn--active' : 'modeBtn'}
                    role="radio"
                    aria-checked={draftDisplayMode === 'icon'}
                    onClick={() => setDraftDisplayMode('icon')}
                  >
                    图标
                  </button>
                  <button
                    type="button"
                    className={draftDisplayMode === 'text' ? 'modeBtn modeBtn--active' : 'modeBtn'}
                    role="radio"
                    aria-checked={draftDisplayMode === 'text'}
                    onClick={() => setDraftDisplayMode('text')}
                  >
                    文字
                  </button>
                </div>
              </div>

              <button type="button" className="primary" disabled={!canSave} onClick={addSite}>
                添加
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
