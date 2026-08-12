import { useMemo, useState } from 'react'
import AnonymousAvatar from './AnonymousAvatar'
import { resolveAvatarSeed } from './SettingsPage'
import EventMemoryModal from './EventMemoryModal'
import { recordEncounter, updateEncounter, deleteEncounter, requestConfirmation } from '../lib/eventEncounters'
import { matchaCta } from '../lib/matchaCta'

const C = {
  gold:      '#C9A33B',
  goldDark:  '#A6822A',
  goldLight: '#E8D9A7',
  goldBg:    '#F8F3E5',
  text:      '#111111',
  textSub:   '#4B5563',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
  ok:        '#059669',
  okBg:      '#ECFDF5',
  okBorder:  '#A7F3D0',
}

/**
 * EventModeSection — the "at the event" attendee list.
 *
 * Renders inside EventDetailPage when the user taps "Enter Event
 * Mode". Each attendee card has a primary action:
 *   • "I met this person"  — first tap; opens EventMemoryModal
 *   • "In memory · Edit"   — subsequent taps; opens the same modal
 *     pre-filled so the user can add topics or a note later
 *
 * The current user is filtered out. Encountered rows show a subtle
 * gold state so the user sees at a glance who's already logged.
 *
 * Attendee data comes in as { user_id, name, avatar_url } via the
 * existing fetchEventAttendees path (see lib/events.js). No new
 * data fetching in this component — encounters are passed down from
 * EventDetailPage so a single fetch feeds both Event Mode + Recap.
 */
export default function EventModeSection({
  eventId, attendees = [], encounters = [],
  currentUserId, knownContext = new Map(), onEncountersChanged,
}) {
  const [search, setSearch] = useState('')
  const [modalTarget, setModalTarget] = useState(null)  // { attendee, existing? }
  const [pendingRequestId, setPendingRequestId] = useState(null)

  // Map for O(1) "did I already meet this person" lookups.
  const byEncounteredId = useMemo(() => {
    const m = new Map()
    for (const e of encounters) m.set(e.encountered_user_id, e)
    return m
  }, [encounters])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return attendees
      .filter(a => a.user_id !== currentUserId)          // don't include yourself
      .filter(a => !q || (a.name || '').toLowerCase().includes(q))
  }, [attendees, currentUserId, search])

  // People you already know (a connection or someone you've met) come first, so
  // the person you matched with in Community is at the top — no preselection.
  const knownOf = (a) => knownContext.get(a.user_id) || (byEncounteredId.has(a.user_id) ? 'You met them' : null)
  const knownList = useMemo(() => visible.filter(a => knownOf(a)), [visible, knownContext, byEncounteredId])
  const otherList = useMemo(() => visible.filter(a => !knownOf(a)), [visible, knownContext, byEncounteredId])

  const metCount = visible.filter(a => byEncounteredId.has(a.user_id)).length

  async function handleSave({ topics, privateNote }) {
    if (!modalTarget) return { error: new Error('No target') }
    const { attendee, existing } = modalTarget
    if (existing) {
      const { error } = await updateEncounter(existing.id, { topics, privateNote })
      if (!error) onEncountersChanged?.()
      return { error }
    }
    const { data, error } = await recordEncounter({
      eventId,
      encounteredUserId: attendee.user_id,
      topics, privateNote,
    })
    if (!error) onEncountersChanged?.()
    return { error }
  }

  async function handleUndo() {
    if (!modalTarget?.existing) return { error: null }
    const { error } = await deleteEncounter(modalTarget.existing.id)
    if (!error) onEncountersChanged?.()
    return { error }
  }

  async function handleAskConfirm(existing) {
    if (!existing) return
    setPendingRequestId(existing.id)
    const { error } = await requestConfirmation(existing.id)
    setPendingRequestId(null)
    if (error) {
      alert('Could not send request: ' + (error.message || 'unknown error'))
      return
    }
    onEncountersChanged?.()
  }

  function renderRow(a, context) {
    const existing = byEncounteredId.get(a.user_id)
    const seed = resolveAvatarSeed(a.avatar_url) || a.user_id
    const met  = Boolean(existing)
    return (
      <li
        key={a.user_id}
        style={{
          padding: '10px 12px',
          borderRadius: 12,
          background: met ? C.goldBg : '#FAFAFA',
          border: `1px solid ${met ? C.goldLight : C.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <AnonymousAvatar seed={seed} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 14, fontWeight: 600, color: C.text, margin: 0,
            fontFamily: 'Inter, system-ui, sans-serif',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {a.name || 'Member'}
          </p>
          {!met && context && (
            <p style={{
              fontSize: 11, fontWeight: 600, color: C.goldDark, margin: '2px 0 0',
              fontFamily: 'Inter, system-ui, sans-serif',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {context}
            </p>
          )}
          {met && existing.topics?.length > 0 && (
            <p style={{
              fontSize: 11, color: C.textMuted, margin: '2px 0 0',
              fontFamily: 'Inter, system-ui, sans-serif',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {existing.topics.slice(0, 3).join(' · ')}
            </p>
          )}
          {met && existing.status === 'mutually_confirmed' && (
            <span style={{
              display: 'inline-block', marginTop: 3,
              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '1px 7px', borderRadius: 99,
              background: C.okBg, color: C.ok, border: `1px solid ${C.okBorder}`,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              ✓ Confirmed
            </span>
          )}
          {met && existing.status === 'confirmation_requested' && (
            <span style={{
              display: 'inline-block', marginTop: 3,
              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '1px 7px', borderRadius: 99,
              background: '#EEF2FF', color: '#4338CA', border: `1px solid #C7D2FE`,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              Awaiting confirm
            </span>
          )}
        </div>
        {met ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setModalTarget({ attendee: a, existing })}
              style={{
                fontSize: 11, fontWeight: 600, color: C.goldDark,
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              Edit
            </button>
            {existing.status === 'self_recorded' && (
              <button
                type="button"
                onClick={() => handleAskConfirm(existing)}
                disabled={pendingRequestId === existing.id}
                style={{
                  fontSize: 11, fontWeight: 500, color: C.textSub,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                Ask them to confirm
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setModalTarget({ attendee: a })}
            className="active:scale-[0.98]"
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              border: 'none',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
              fontFamily: 'Inter, system-ui, sans-serif',
              cursor: 'pointer', whiteSpace: 'nowrap',
              ...matchaCta,
            }}
          >
            I met this person
          </button>
        )}
      </li>
    )
  }

  const groupLabel = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: C.goldDark, fontFamily: 'Inter, system-ui, sans-serif', margin: '2px 0 6px',
  }

  return (
    <section
      className="rounded-2xl p-5 mb-4"
      style={{ background: C.white, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs uppercase tracking-wider" style={{ color: C.textMuted, margin: 0 }}>
          People at this event
        </p>
        <p style={{
          fontSize: 11, fontWeight: 600, color: C.goldDark,
          fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
        }}>
          You met {metCount} / {visible.length}
        </p>
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search attendees"
        className="w-full rounded-xl px-3 py-2 text-sm mb-3"
        style={{
          background: '#FAFAFA',
          border: `1px solid ${C.border}`,
          outline: 'none',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      />

      {visible.length === 0 && (
        <p style={{
          fontSize: 12.5, color: C.textMuted, lineHeight: 1.55,
          fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
        }}>
          No matches. Adjust your search — or if the attendee list is empty, wait for people to join.
        </p>
      )}

      {knownList.length > 0 && (
        <>
          <p style={groupLabel}>People you know</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {knownList.map(a => renderRow(a, knownOf(a)))}
          </ul>
        </>
      )}
      {otherList.length > 0 && (
        <>
          {knownList.length > 0 && <p style={groupLabel}>Other attendees</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {otherList.map(a => renderRow(a, null))}
          </ul>
        </>
      )}

      <EventMemoryModal
        open={Boolean(modalTarget)}
        onClose={() => setModalTarget(null)}
        person={modalTarget?.attendee || {}}
        initialTopics={modalTarget?.existing?.topics || []}
        initialNote={modalTarget?.existing?.private_note || ''}
        onSave={handleSave}
        onDelete={modalTarget?.existing ? handleUndo : undefined}
      />
    </section>
  )
}
