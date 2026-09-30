import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { isNativeApp } from '../lib/platform'

export const DISPLAY_MODE_KEY = 'mutu:web-view'
const MODES = ['auto', 'mobile', 'desktop']
const DisplayModeContext = createContext(null)
const validMode = value => MODES.includes(value) ? value : 'auto'
function savedMode() {
  if (isNativeApp) return 'auto'
  try { return validMode(localStorage.getItem(DISPLAY_MODE_KEY)) } catch { return 'auto' }
}
export function resolveDisplayMode(mode, width) {
  if (mode === 'mobile') return 'mobile'
  if (mode === 'desktop' || width >= 1024) return 'desktop'
  return width >= 640 ? 'tablet' : 'mobile'
}

export function DisplayModeProvider({ children }) {
  const [mode, setMode] = useState(savedMode)
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth)
    const storage = event => {
      if (!isNativeApp && (event.key === DISPLAY_MODE_KEY || event.key === null)) setMode(savedMode())
    }
    window.addEventListener('resize', resize)
    window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('storage', storage)
    }
  }, [])
  const layout = resolveDisplayMode(mode, width)
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.mutuView = mode
    root.dataset.mutuLayout = layout
    root.dataset.mutuWide = String(layout === 'desktop' && width >= 1280)
    return () => {
      delete root.dataset.mutuView
      delete root.dataset.mutuLayout
      delete root.dataset.mutuWide
    }
  }, [mode, layout, width])
  const choose = next => {
    if (isNativeApp) return
    const value = validMode(next)
    setMode(value)
    try { localStorage.setItem(DISPLAY_MODE_KEY, value) } catch { /* This visit still works without storage. */ }
  }
  return <DisplayModeContext.Provider value={{ mode, choose }}>{children}</DisplayModeContext.Provider>
}

export default function DisplayModeSwitcher() {
  const display = useContext(DisplayModeContext)
  if (!display || isNativeApp) return null
  return <label className="mutu-view-switcher">
    <span>View</span>
    <select aria-label="Website view" value={display.mode} onChange={event => display.choose(event.target.value)}>
      <option value="auto">Auto</option>
      <option value="mobile">Mobile</option>
      <option value="desktop">PC</option>
    </select>
  </label>
}
