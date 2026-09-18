import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { isNativeApp } from '../lib/platform'

// Tap the mic and it listens at once; the words appear live in the text
// box. Tap again to stop. The text stays an editable draft, never sent
// automatically. The web uses the browser's speech service; the iOS app
// uses Apple speech recognition through the in-app MutuSpeech plugin (on
// device when possible). Where neither exists, tapping opens the keyboard
// so its own microphone can be used.
const NativeSpeech = isNativeApp && Capacitor.getPlatform() === 'ios' ? registerPlugin('MutuSpeech') : null

export const VOICE_LANGUAGES = [
  { id: 'en-US', label: 'English' },
  { id: 'zh-CN', label: '中文' },
  { id: 'fr-CA', label: 'Français' },
]
const LANGUAGE_KEY = 'mutu:voiceLanguage'
function initialLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    if (VOICE_LANGUAGES.some(l => l.id === saved)) return saved
  } catch {}
  const nav = (navigator.language || '').toLowerCase()
  return nav.startsWith('zh') ? 'zh-CN' : nav.startsWith('fr') ? 'fr-CA' : 'en-US'
}

const DENIED_NATIVE = 'Microphone or speech recognition is off for Mutu. You can turn both on in Settings, or keep typing.'
const DENIED_WEB = 'Microphone access was not allowed. You can keep typing.'
const FAILED = 'Voice typing could not start. Try again, or keep typing.'

export default function VoiceTyping({ onDraft = () => {}, onActiveChange = () => {}, inputRef }) {
  const [active, setActive] = useState(false)
  const [note, setNote] = useState('')
  const [language, setLanguage] = useState(initialLanguage)
  const [nativeReady, setNativeReady] = useState(false)
  const session = useRef(null)
  const restartWith = useRef(null)
  const callbacks = useRef({ onDraft, onActiveChange })
  callbacks.current = { onDraft, onActiveChange }
  const Recognition = !isNativeApp && (window.SpeechRecognition || window.webkitSpeechRecognition)
  const canListen = Boolean(Recognition) || nativeReady

  useEffect(() => {
    let alive = true
    NativeSpeech?.available().then(r => { if (alive) setNativeReady(Boolean(r?.available)) }).catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!note) return undefined
    const t = setTimeout(() => setNote(''), 5000)
    return () => clearTimeout(t)
  }, [note])

  const finish = own => {
    if (session.current !== own) return
    session.current = null
    setActive(false)
    callbacks.current.onActiveChange(false)
    const next = restartWith.current
    restartWith.current = null
    if (next) begin(next)
  }

  const startWeb = lang => {
    const recognition = new Recognition()
    const own = {
      stop: () => recognition.stop(),
      discard: () => { recognition.onresult = recognition.onerror = recognition.onend = null; recognition.abort() },
    }
    session.current = own
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = event => {
      let text = ''
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript
      callbacks.current.onDraft(text.trim())
    }
    recognition.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setNote(DENIED_WEB)
      else if (event.error !== 'no-speech' && event.error !== 'aborted') setNote(FAILED)
    }
    recognition.onend = () => finish(own)
    setActive(true)
    callbacks.current.onActiveChange(true)
    try { recognition.start() } catch { own.discard(); finish(own); setNote(FAILED) }
  }

  // iOS: each result carries the full transcript of this session so far.
  const startNative = async lang => {
    const handles = []
    const release = () => { handles.splice(0).forEach(h => h.remove()) }
    let guard = null
    const own = {
      stop: () => {
        NativeSpeech.stop().catch(() => {})
        guard = setTimeout(() => { release(); finish(own) }, 3000)   // never stay stuck listening
      },
      discard: () => { release(); NativeSpeech.stop().catch(() => {}) },
    }
    session.current = own
    setActive(true)
    callbacks.current.onActiveChange(true)
    handles.push(await NativeSpeech.addListener('result', ({ text }) => {
      if (session.current === own) callbacks.current.onDraft(String(text || '').trim())
    }))
    handles.push(await NativeSpeech.addListener('end', () => { clearTimeout(guard); release(); finish(own) }))
    if (session.current !== own) { release(); return }
    try {
      await NativeSpeech.start({ language: lang })
    } catch (error) {
      release()
      finish(own)
      setNote(error?.code === 'not-allowed' ? DENIED_NATIVE : FAILED)
    }
  }

  const begin = lang => (Recognition ? startWeb : startNative)(lang)

  const toggle = () => {
    setNote('')
    if (session.current) { restartWith.current = null; session.current.stop(); return }
    if (!canListen) {
      inputRef?.current?.focus()
      setNote('Tap the microphone on your keyboard to speak.')
      return
    }
    begin(language)
  }

  const switchLanguage = () => {
    const i = VOICE_LANGUAGES.findIndex(l => l.id === language)
    const next = VOICE_LANGUAGES[(i + 1) % VOICE_LANGUAGES.length].id
    setLanguage(next)
    try { localStorage.setItem(LANGUAGE_KEY, next) } catch {}
    if (session.current) { restartWith.current = next; session.current.stop() }
  }

  useEffect(() => {
    const drop = () => {
      const own = session.current
      if (!own) return
      restartWith.current = null
      own.discard()
      session.current = null
      setActive(false)
      callbacks.current.onActiveChange(false)
    }
    const hide = () => { if (document.hidden) drop() }
    document.addEventListener('visibilitychange', hide)
    return () => { document.removeEventListener('visibilitychange', hide); drop() }
  }, [])

  const label = VOICE_LANGUAGES.find(l => l.id === language)?.label
  const buttonStyle = {
    minHeight: 44, minWidth: 44, padding: '8px 12px', borderRadius: 12,
    border: `1px solid ${active ? '#49603B' : '#CBDBCF'}`,
    background: active ? '#49603B' : '#EDF3EE', color: active ? '#fff' : '#214E3A',
  }
  return <div style={{ position: 'relative', flexShrink: 0 }}>
    {(active || note) && <div role="status" aria-live="polite" style={{
      position: 'absolute', bottom: 52, left: 0, zIndex: 30,
      width: note ? 'min(260px, calc(100vw - 48px))' : 'max-content',
      padding: '6px 10px', borderRadius: 12, border: '1px solid #E8D9A7',
      background: '#fffdf7', boxShadow: '0 4px 16px #0002', fontSize: 12.5, lineHeight: 1.45, color: '#214E3A',
    }}>
      {note || <>Listening · <button type="button" onClick={switchLanguage} aria-label={`Voice language: ${label}. Tap to change`}
        style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontWeight: 700, color: '#49603B', textDecoration: 'underline', cursor: 'pointer' }}>{label}</button></>}
    </div>}
    <button type="button" aria-label={active ? 'Stop voice typing' : 'Voice typing'} aria-pressed={active} onClick={toggle} style={buttonStyle}>
      {active ? <Square size={16} fill="currentColor" aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
    </button>
  </div>
}
