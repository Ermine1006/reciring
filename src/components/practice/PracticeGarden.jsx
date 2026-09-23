import { useEffect, useRef, useState } from 'react'
import { PILOT_PRACTICE_TYPES, PRACTICE_TYPE_SHORT } from '../../data/practiceOptions'
import { mutualFit } from '../../lib/practiceMatching'
import PartnerCard from './PartnerCard'
import { avatarAppearance } from '../AnonymousAvatar'
import { List, Sprout } from 'lucide-react'

// Preserve the server's evidence based order. Walking changes presentation,
// never eligibility, identity, scores or the invitation/acceptance contract.
export function gardenCandidates(rows, request, type) {
  return rows.filter(row => mutualFit(request, row) && (type === 'all' ||
    (request.want_types?.includes(type) && row.help_types?.includes(type))))
}

const pixels = [
  '................', '................', '................', '.....000000.....',
  '...0022222200...', '..022333322220..', '..023333222220..', '.02222222222220.',
  '.02282822282820.', '.02287822287820.', '.02222222222220.', '0422242224222240',
  '0422220002222240', '.04222222222240.', '..042222222240..', '...0444444440...',
  '....00000000....',
]
export function GardenWalker({ avatarSeed }) {
  const { palette: p, accessory } = avatarAppearance(avatarSeed || 'av-14')
  const palette = [p.bodyDk, p.body, p.body, p.bodyLt, p.bodyDk, '#FFE566', '#FF9933', '#fffbe6', p.eyes]
  return <svg aria-hidden="true" data-avatar-body={p.body} data-avatar-accessory={accessory}
    viewBox="0 0 16 17" width="44" height="47" shapeRendering="crispEdges">
    {pixels.flatMap((row, y) => [...row].flatMap((pixel, x) => pixel === '.' ? [] :
      <rect key={`${x}:${y}`} x={x} y={y} width="1" height="1" fill={palette[Number(pixel)]} />))}
    {accessory === 1 && <g fill="#FF9EC5"><path d="M3 1h3v1h4V1h3v4h-3V4H6v1H3z" /><rect x="7" y="2" width="2" height="2" fill="#FF6EAA" /></g>}
    {accessory === 2 && <g fill="#FFE566"><path d="M7 0h2v2h2v2H9v2H7V4H5V2h2z" /><rect x="7" y="2" width="2" height="2" fill="#FF9933" /></g>}
    {accessory === 3 && <path d="M8 12h1v1h2v1H9v2H8v-1H7v-1H6v-1h2z" fill="#C9A33B" />}
    {accessory === 4 && <g fill="none" stroke={p.eyes} strokeWidth=".6"><rect x="2" y="7.5" width="4" height="3" /><rect x="9" y="7.5" width="4" height="3" /><path d="M6 8.5h3" /></g>}
  </svg>
}

export default function PracticeGarden({ rows, request, busyId, onInvite, onPreferences, avatarSeed, resetKey = '' }) {
  const [view, setView] = useState('garden')
  const [type, setType] = useState('all')
  const typesKey = JSON.stringify([request.want_types, request.help_types])
  return <section className="practice-garden" aria-label="Find a practice partner">
    <div className="garden-toolbar">
      <div className="garden-type-options" role="group" aria-label="Filter by what I want to practise">
        {['all', ...PILOT_PRACTICE_TYPES].map(key => <button key={key} type="button"
          aria-pressed={type === key} disabled={Boolean(busyId)} onClick={() => setType(key)}>
          {key === 'all' ? 'All' : PRACTICE_TYPE_SHORT[key]}
        </button>)}
      </div>
      <button type="button" className="quest-link" disabled={Boolean(busyId)} onClick={() => setView(view === 'garden' ? 'list' : 'garden')}>
        {view === 'garden' ? <List size={16} aria-hidden="true" /> : <Sprout size={16} aria-hidden="true" />}
        {view === 'garden' ? 'List view' : 'Garden view'}
      </button>
    </div>
    <GardenResults key={`${type}:${typesKey}:${resetKey}`} view={view} setView={setView} rows={gardenCandidates(rows, request, type)}
      request={request} type={type} busyId={busyId} onInvite={onInvite} onPreferences={onPreferences} avatarSeed={avatarSeed} />
  </section>
}

function GardenResults({ rows, request, type, view, setView, busyId, onInvite, onPreferences, avatarSeed }) {
  const [seen, setSeen] = useState([])
  const [encounterId, setEncounterId] = useState(null)
  const [walkingTo, setWalkingTo] = useState(null)
  const [imageFailed, setImageFailed] = useState(false)
  const headingRef = useRef(null)
  const walkingAvailable = rows.some(row => row.request_id === walkingTo)
  const encounter = rows.find(row => row.request_id === encounterId)
  const next = rows.find(row => !seen.includes(row.request_id))
  const displayedRequest = type === 'all' ? request : { ...request, want_types: [type] }

  useEffect(() => {
    if (!walkingTo) return
    if (!walkingAvailable || view !== 'garden') { setWalkingTo(null); return }
    const finish = () => {
      setEncounterId(walkingTo)
      setSeen(previous => previous.includes(walkingTo) ? previous : [...previous, walkingTo])
      setWalkingTo(null)
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (reduced?.matches || document.hidden) { finish(); return }
    const timer = window.setTimeout(finish, 900)
    const stop = () => { if (document.hidden || reduced?.matches) finish() }
    document.addEventListener('visibilitychange', stop)
    reduced?.addEventListener?.('change', stop)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', stop)
      reduced?.removeEventListener?.('change', stop)
    }
  }, [walkingTo, walkingAvailable, view])
  useEffect(() => {
    if (encounterId && view === 'garden') {
      headingRef.current?.focus({ preventScroll: true })
      headingRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' })
    }
  }, [encounterId, view])

  if (!rows.length) return <div className="quest-paper">
    <h3>{type !== 'all' && !request.want_types?.includes(type) ? 'Add this practice type to your preferences' : 'No partners for this filter right now'}</h3>
    <p>You can review your practice types or choose All to see your other matches.</p>
    <button type="button" className="quest-secondary" onClick={onPreferences}>Edit practice types</button>
  </div>
  if (view === 'list') return <div className="garden-partner-list">
    {rows.map(row => <PartnerCard key={row.request_id} row={row} myRequest={displayedRequest} onInvite={onInvite} busy={busyId === row.request_id} />)}
  </div>

  return <>
    <div className={`garden-stage ${walkingTo ? 'is-walking' : ''} ${encounter ? 'has-encounter' : ''}`}>
      {!imageFailed && <img src="/illustrations/practice-garden.webp" alt="" onError={() => setImageFailed(true)} />}
      <div className="garden-caption"><span>THE PRACTICE GARDEN</span><h3>A little walk. A useful connection.</h3></div>
      <div className="garden-walker"><GardenWalker avatarSeed={avatarSeed} /></div>
      <span className="garden-sign" aria-hidden="true">✦</span>
    </div>
    <div className="garden-walk-actions">
      {next ? <button type="button" className="quest-primary" disabled={Boolean(walkingTo || busyId)}
        onClick={() => { setEncounterId(null); setWalkingTo(next.request_id) }}>
        {walkingTo ? 'Walking…' : seen.length ? 'Meet the next teammate' : 'Explore the garden'}
      </button> : <div className="garden-end"><p>You’ve explored these recommendations.</p>
        <button type="button" className="quest-secondary" onClick={() => setView('list')}>See all partners</button></div>}
    </div>
    {walkingTo && <p role="status">Meeting your next recommended teammate…</p>}
    {encounter && <div className="garden-encounter">
      <h3 ref={headingRef} tabIndex={-1}>Meet your teammate</h3>
      <PartnerCard key={encounter.request_id} row={encounter} myRequest={displayedRequest} onInvite={onInvite} busy={busyId === encounter.request_id} />
    </div>}
  </>
}
