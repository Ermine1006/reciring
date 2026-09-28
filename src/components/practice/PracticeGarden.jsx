import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PRACTICE_TYPE_SHORT } from '../../data/practiceOptions'
import { mutualFit } from '../../lib/practiceMatching'
import PartnerCard from './PartnerCard'
import AnonymousAvatar from '../AnonymousAvatar'
import { List, Sprout, X, Sparkles } from 'lucide-react'
import PracticeDirectionPicker, { useFinancePracticeSupport } from './PracticeDirectionPicker'
import { directionForTypes, TYPES_BY_DIRECTION } from '../../data/practiceDirections'

// Real candidates only. The garden never invents decorative people.
const AVATAR_POSITIONS = [
  { left: '22%', top: '69%' },
  { left: '49%', top: '57%' },
  { left: '75%', top: '70%' },
  { left: '34%', top: '39%' },
  { left: '65%', top: '35%' },
  { left: '84%', top: '48%' },
]

// Preserve the server's evidence based order. The first eligible row is the
// recommended teammate; the garden changes presentation, never ranking.
export function gardenCandidates(rows, request, type) {
  return rows.filter(row => mutualFit(request, row) && (type === 'all' ||
    (request.want_types?.includes(type) && row.help_types?.includes(type))))
}

export default function PracticeGarden({ rows, request, busyId, onInvite, onPreferences, resetKey = '' }) {
  const [view, setView] = useState('garden')
  const [type, setType] = useState('all')
  const [direction, setDirection] = useState(directionForTypes(request.want_types))
  const finance = useFinancePracticeSupport()
  const visibleTypes = TYPES_BY_DIRECTION[direction]
  const scopedRequest = { ...request, want_types: (request.want_types || []).filter(key => visibleTypes.includes(key)) }
  const typesKey = JSON.stringify([request.want_types, request.help_types])

  return <section className="practice-garden" aria-label="Find a practice partner">
    <PracticeDirectionPicker value={direction} onChange={next => { setDirection(next); setType('all') }} finance={finance} disabled={Boolean(busyId)} />
    <div className="garden-toolbar">
      <div className="garden-type-options" role="group" aria-label="Filter by what I want to practise">
        {['all', ...visibleTypes].map(key => <button key={key} type="button"
          aria-pressed={type === key} disabled={Boolean(busyId)} onClick={() => setType(key)}>
          {key === 'all' ? 'All' : PRACTICE_TYPE_SHORT[key]}
        </button>)}
      </div>
      <button type="button" className="quest-link" disabled={Boolean(busyId)}
        onClick={() => setView(view === 'garden' ? 'list' : 'garden')}>
        {view === 'garden' ? <List size={16} aria-hidden="true" /> : <Sprout size={16} aria-hidden="true" />}
        {view === 'garden' ? 'List view' : 'Garden view'}
      </button>
    </div>

    <GardenResults key={`${direction}:${type}:${typesKey}:${resetKey}`}
      view={view} setView={setView} rows={gardenCandidates(rows, scopedRequest, type)}
      request={request} type={type} busyId={busyId} onInvite={onInvite} onPreferences={onPreferences} />
  </section>
}

function GardenResults({ rows, request, type, view, setView, busyId, onInvite, onPreferences }) {
  const [encounterId, setEncounterId] = useState(null)
  const [lastOpenedId, setLastOpenedId] = useState(null)
  const [imageFailed, setImageFailed] = useState(false)
  const autoShown = useRef(false)
  const focusRef = useRef(null)
  const avatarRefs = useRef({})
  const displayedRequest = type === 'all' ? request : { ...request, want_types: [type] }
  const encounter = rows.find(row => row.request_id === encounterId) || null
  const encounterIndex = encounter ? rows.findIndex(row => row.request_id === encounter.request_id) : -1
  const nextAfterEncounter = encounterIndex >= 0 && rows.length > 1 ? rows[(encounterIndex + 1) % rows.length] : null
  const lastIndex = rows.findIndex(row => row.request_id === lastOpenedId)
  const nextFromGarden = rows.length > 1 ? rows[(lastIndex >= 0 ? lastIndex + 1 : 0) % rows.length] : rows[0] || null

  const openCandidate = (row, trigger = null) => {
    if (!row) return
    if (trigger) focusRef.current = trigger
    else if (avatarRefs.current[row.request_id]) focusRef.current = avatarRefs.current[row.request_id]
    setLastOpenedId(row.request_id)
    setEncounterId(row.request_id)
  }

  const topCandidateId = rows[0]?.request_id || null

  // Lindsay feedback: surface the first real recommendation immediately.
  // Depend on the stable top candidate id, not the rows array itself:
  // background polling replaces that array and previously kept cancelling
  // the delayed timer before the card could open.
  useEffect(() => {
    if (view !== 'garden' || !topCandidateId || autoShown.current) return
    autoShown.current = true
    const top = rows.find(row => row.request_id === topCandidateId)
    if (!top) return
    if (avatarRefs.current[topCandidateId]) focusRef.current = avatarRefs.current[topCandidateId]
    setLastOpenedId(topCandidateId)
    setEncounterId(topCandidateId)
  }, [view, topCandidateId])

  // Polling can remove a candidate while their card is open.
  useEffect(() => {
    if (encounterId && !rows.some(row => row.request_id === encounterId)) setEncounterId(null)
  }, [rows, encounterId])

  if (!rows.length) return <div className="quest-paper">
    <h3>{type !== 'all' && !request.want_types?.includes(type) ? 'Add this practice type to your preferences' : 'No partners for this filter right now'}</h3>
    <p>You can review your practice types or choose All to see your other matches.</p>
    <button type="button" className="quest-secondary" onClick={onPreferences}>Edit practice types</button>
  </div>

  if (view === 'list') return <div className="garden-list-view">
    <div className="garden-list-heading">
      <div><strong>All matching teammates</strong><small>Same real matches, shown as a list.</small></div>
      <button type="button" className="quest-link" onClick={() => setView('garden')}><Sprout size={16} /> Back to garden</button>
    </div>
    <div className="garden-partner-list">
      {rows.map(row => <PartnerCard key={row.request_id} row={row} myRequest={displayedRequest}
        onInvite={onInvite} busy={busyId === row.request_id} />)}
    </div>
  </div>

  const gardenRows = rows.slice(0, AVATAR_POSITIONS.length)

  return <>
    <div className="garden-stage garden-stage-interactive">
      {!imageFailed && <img src="/illustrations/practice-garden.webp" alt="" onError={() => setImageFailed(true)} />}
      <div className="garden-caption">
        <span>Your practice garden</span>
        <small>Tap someone to see why you could help each other.</small>
      </div>

      {gardenRows.map((row, index) => {
        const top = index === 0
        return <button key={row.request_id} type="button"
          ref={node => { if (node) avatarRefs.current[row.request_id] = node }}
          className={`garden-avatar ${top ? 'is-top' : ''}`}
          style={AVATAR_POSITIONS[index]}
          aria-label={top ? 'Open top match' : `Open teammate ${index + 1}`}
          onClick={event => openCandidate(row, event.currentTarget)}
          disabled={Boolean(busyId)}>
          {top && <span className="garden-top-badge"><Sparkles size={12} aria-hidden="true" /> Top match</span>}
          <span className="garden-avatar-shell"><AnonymousAvatar seed={`practice:${row.request_id}`} size={top ? 62 : 52} /></span>
        </button>
      })}

      <div className="garden-discovery-note">
        <Sparkles size={14} aria-hidden="true" />
        <span>{rows.length > gardenRows.length ? `${gardenRows.length} shown · more in List view` : `${rows.length} ${rows.length === 1 ? 'teammate' : 'teammates'} to explore`}</span>
      </div>
    </div>

    <div className="garden-action-row">
      {rows.length > 1
        ? <button type="button" className="quest-primary" disabled={Boolean(busyId)}
            onClick={event => openCandidate(nextFromGarden, event.currentTarget)}>
            Show me another match
          </button>
        : <p>Tap the avatar to view this teammate.</p>}
      <small>Every avatar is a real match from your current practice pool.</small>
    </div>

    {encounter && <EncounterDialog key={encounter.request_id}
      topMatch={rows[0]?.request_id === encounter.request_id}
      returnRef={focusRef}
      onClose={() => setEncounterId(null)}
      onContinue={() => nextAfterEncounter ? openCandidate(nextAfterEncounter) : setEncounterId(null)}
      hasNext={Boolean(nextAfterEncounter)}
      busy={Boolean(busyId)}>
      <PartnerCard compact
        heading={rows[0]?.request_id === encounter.request_id ? 'Recommended teammate' : 'Teammate profile'}
        row={encounter} myRequest={displayedRequest} onInvite={onInvite}
        busy={busyId === encounter.request_id} />
    </EncounterDialog>}
  </>
}

function EncounterDialog({ children, topMatch, onClose, onContinue, hasNext, busy, returnRef }) {
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (!dialog.open) dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      returnRef.current?.focus({ preventScroll: true })
    }
  }, [returnRef])

  return createPortal(<dialog ref={dialogRef} className="garden-dialog practice-ui" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="garden-dialog-layout">
      <header>
        <div>
          <small>{topMatch ? '✦ Recommended from your preferences' : 'Practice garden'}</small>
          <h2 id={titleId}>{topMatch ? 'Top match for you' : 'Meet this teammate'}</h2>
        </div>
        <button autoFocus type="button" aria-label="Close teammate card" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="garden-dialog-body">{children}</div>
      <footer><button type="button" disabled={busy} onClick={onContinue}>{hasNext ? 'See next match' : 'Back to garden'}</button></footer>
    </div>
  </dialog>, document.body)
}
