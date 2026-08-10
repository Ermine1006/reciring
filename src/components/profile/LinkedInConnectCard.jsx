import { C } from './theme'

// "Build your profile faster" — the LinkedIn entry point at the top of Edit
// Profile. LinkedIn blue appears ONLY on the official connect button; the rest
// stays in Mutu's warm system. Never labelled "import full profile".
export default function LinkedInConnectCard({ onConnect, onManual, connecting = false, error = null, connected = false }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: '20px 18px', fontFamily: C.sans }}>
      <p style={{ margin: 0, fontSize: 16.5, fontWeight: 700, color: C.title, fontFamily: C.serif }}>
        {connected ? 'LinkedIn connected' : 'Build your profile faster'}
      </p>
      <p style={{ margin: '6px 0 16px', fontSize: 13.5, color: C.sub, lineHeight: 1.5 }}>
        {connected
          ? 'You can reconnect to refresh your basic info, or just keep editing below.'
          : 'Connect your LinkedIn to add the basic professional info available with your permission. You’ll review everything before it appears on Mutu.'}
      </p>

      {error && (
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#B4453A', background: '#FBEEEC', border: '1px solid #F0D6D2', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45 }}>
          {error}
        </p>
      )}

      <button type="button" onClick={onConnect} disabled={connecting}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: connecting ? '#7FA8D4' : '#0A66C2', color: '#fff', border: 'none', borderRadius: 12,
          padding: '14px', fontSize: 14.5, fontWeight: 700, cursor: connecting ? 'default' : 'pointer', fontFamily: C.sans }}>
        <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 4, background: '#fff', color: '#0A66C2', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>in</span>
        {connecting ? 'Opening LinkedIn…' : (connected ? 'Reconnect LinkedIn' : 'Connect LinkedIn')}
      </button>

      <button type="button" onClick={onManual}
        style={{ width: '100%', marginTop: 10, background: 'transparent', border: 'none', color: C.sub, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: C.sans, padding: '6px' }}>
        Continue manually
      </button>
    </div>
  )
}
