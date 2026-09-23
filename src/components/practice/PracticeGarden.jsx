import { useEffect, useRef, useState } from 'react'
import { PILOT_PRACTICE_TYPES, PRACTICE_TYPE_SHORT } from '../../data/practiceOptions'
import { mutualFit } from '../../lib/practiceMatching'
import PartnerCard from './PartnerCard'

// Preserve the server's evidence based order. Walking changes presentation,
// never eligibility, identity, scores or the invitation/acceptance contract.
export function gardenCandidates(rows, request, type) {
  return rows.filter(row => mutualFit(request, row) && (type === 'all' ||
    (request.want_types?.includes(type) && row.help_types?.includes(type))))
}

const pixels = [
  '......555.......', '.....55655......', '......66........', '.....000000.....',
  '...0022222200...', '..022333322220..', '..023333222220..', '.02222222222220.',
  '.02282822282820.', '.02287822287820.', '.02222222222220.', '0422242224222240',
  '0422220002222240', '.04222222222240.', '..042222222240..', '...0444444440...',
  '....00000000....',
]
const palette = ['#244c50', '#74bdd1', '#a4dbea', '#d4f2ed', '#3c829a', '#f3d272', '#d7b753', '#fffbe6', '#182d38']
function Walker() {
  return <svg aria-hidden="true" viewBox="0 0 16 17" width="40" height="43" shapeRendering="crispEdges">
    {pixels.flatMap((row, y) => [...row].flatMap((pixel, x) => pixel === '.' ? [] :
      <rect key={`${x}:${y}`} x={x} y={y} width="1" height="1" fill={palette[Number(pixel)]} />))}
  </svg>
}

export default function PracticeGarden({ rows, request, busyId, onInvite, onPreferences, resetKey = '' }) {
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
        {view === 'garden' ? 'List view' : 'Garden view'}
      </button>
    </div>
    <p className="garden-filter-hint">{type === 'all' ? 'Partners for your saved practice types.' :
      `Partners who can help you practise ${PRACTICE_TYPE_SHORT[type].toLowerCase()}.`} Your support preferences still apply.</p>
    <GardenResults key={`${type}:${typesKey}:${resetKey}`} view={view} setView={setView} rows={gardenCandidates(rows, request, type)}
      request={request} type={type} busyId={busyId} onInvite={onInvite} onPreferences={onPreferences} />
  </section>
}

function GardenResults({ rows, request, type, view, setView, busyId, onInvite, onPreferences }) {
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
      <div className="garden-walker"><Walker /></div>
      <span className="garden-sign" aria-hidden="true">✦</span>
    </div>
    <div className="garden-walk-actions">
      {next ? <button type="button" className="quest-primary" disabled={Boolean(walkingTo || busyId)}
        onClick={() => { setEncounterId(null); setWalkingTo(next.request_id) }}>
        {walkingTo ? 'Walking…' : seen.length ? 'Meet the next teammate' : 'Explore the garden'}
      </button> : <div className="garden-end"><p>You’ve explored these recommendations.</p>
        <button type="button" className="quest-secondary" onClick={() => setView('list')}>See all partners</button></div>}
      <p>Walking is optional. List view shows the same partners.</p>
    </div>
    {walkingTo && <p role="status">Meeting your next recommended teammate…</p>}
    {encounter && <div className="garden-encounter">
      <h3 ref={headingRef} tabIndex={-1}>Meet your teammate</h3>
      <PartnerCard key={encounter.request_id} row={encounter} myRequest={displayedRequest} onInvite={onInvite} busy={busyId === encounter.request_id} />
    </div>}
  </>
}
