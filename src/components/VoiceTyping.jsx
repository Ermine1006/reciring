import { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { isNativeApp } from '../lib/platform'

// Recognition produces a draft only. Native apps use OS keyboard dictation,
// avoiding an additional recording service or native microphone permission.
export default function VoiceTyping({ onTranscript, onActiveChange, inputRef }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(false)
  const [message, setMessage] = useState('')
  const [interim, setInterim] = useState('')
  const [language, setLanguage] = useState(navigator.language?.startsWith('zh') ? 'zh-CN' : 'en-US')
  const session = useRef(null)
  const callbacks = useRef({ onTranscript, onActiveChange })
  callbacks.current = { onTranscript, onActiveChange }
  const Recognition = !isNativeApp && (window.SpeechRecognition || window.webkitSpeechRecognition)
  const dispose = () => {
    const recognition = session.current
    session.current = null
    if (recognition) {
      recognition.onresult = recognition.onerror = recognition.onend = null
      recognition.abort()
    }
  }
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        dispose()
        setActive(false)
        setInterim('')
        callbacks.current.onActiveChange(false)
      }
    }
    document.addEventListener('visibilitychange', hide)
    return () => { document.removeEventListener('visibilitychange', hide); dispose(); callbacks.current.onActiveChange(false) }
  }, [])
  const start = () => {
    if (session.current || !Recognition) return
    setMessage('')
    setInterim('')
    const recognition = new Recognition()
    session.current = recognition
    recognition.lang = language
    recognition.continuous = false
    recognition.interimResults = true
    recognition.onresult = event => {
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.trim()
        if (event.results[i].isFinal && text) callbacks.current.onTranscript(text)
        else pending += text
      }
      setInterim(pending)
    }
    recognition.onerror = event => {
      setMessage(event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Microphone access was not allowed. You can keep typing or use keyboard dictation.'
        : 'Voice input could not finish. Try again or use keyboard dictation.')
    }
    recognition.onend = () => {
      session.current = null
      setActive(false)
      setInterim('')
      callbacks.current.onActiveChange(false)
    }
    try {
      setActive(true)
      callbacks.current.onActiveChange(true)
      recognition.start()
    } catch {
      dispose()
      setActive(false)
      callbacks.current.onActiveChange(false)
      setMessage('Voice input is unavailable here. Use your keyboard microphone or keep typing.')
    }
  }
  const buttonStyle = { minHeight: 44, padding: '8px 12px', border: '1px solid #CBDBCF', borderRadius: 12, background: '#EDF3EE', color: '#214E3A' }
  return <div style={{ position: 'relative', flexShrink: 0 }}>
    <button type="button" aria-label="Voice typing" aria-expanded={open} onClick={() => setOpen(true)} style={buttonStyle}><Mic size={18} aria-hidden="true" /></button>
    {open && <div role="region" aria-label="Voice typing controls" style={{ position: 'absolute', bottom: 52, left: 0, width: 'min(300px, calc(100vw - 48px))', padding: 16, border: '1px solid #E8D9A7', borderRadius: 16, background: '#fffdf7', boxShadow: '0 8px 28px #0002', zIndex: 30 }}>
      <strong>Voice typing</strong>
      {Recognition ? <>
        <p style={{ fontSize: 12, lineHeight: 1.5 }}>Speech becomes an editable draft. Your browser may send audio to its speech service. Mutu does not store audio.</p>
        <label style={{ fontSize: 13 }}>Language <select aria-label="Dictation language" value={language} disabled={active} onChange={e => setLanguage(e.target.value)}>
          <option value="en-US">English</option><option value="zh-CN">中文</option><option value="fr-CA">Français</option>
        </select></label>
        <p role="status" style={{ fontSize: 13 }}>{message || (active ? `Listening… ${interim}` : 'Review the words before you send.')}</p>
        <button type="button" style={buttonStyle} onClick={active ? () => session.current?.stop() : start}>{active ? 'Stop listening' : 'Start voice typing'}</button>
      </> : <>
        <p style={{ fontSize: 13, lineHeight: 1.5 }}>Tap the microphone on your keyboard to turn speech into text. Review and edit it before sending. If the microphone is missing, enable dictation in your keyboard settings.</p>
        <button type="button" style={buttonStyle} onClick={() => { inputRef.current?.focus(); setOpen(false) }}>Open keyboard</button>
      </>}
      <button type="button" style={{ ...buttonStyle, marginLeft: 8, background: '#fff' }} onClick={() => { dispose(); setActive(false); setInterim(''); onActiveChange(false); setOpen(false) }}>Close</button>
    </div>}
  </div>
}
