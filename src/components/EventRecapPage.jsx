import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import AnonymousAvatar from './AnonymousAvatar'
import { resolveAvatarSeed } from './SettingsPage'
import EventMemoryModal from './EventMemoryModal'
import FollowUpModal from './FollowUpModal'
import {
  listEncountersForEvent, updateEncounter, deleteEncounter,
  reconcileMyConfirmations, unmarkEncounterFollowedUp,
} from '../lib/eventEncounters'
import { openOrCreateDirectMatch } from '../lib/matches'
import { addFollowup } from '../lib/eventMemory'
import { whyThisConnectionMayMatter, rankByConnectionValue } from '../lib/opportunityMatch'

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
 * EventRecapPage — post-event summary of everyone the user met,
 * with rule-based opportunity recall + follow-up prompts + a
 * "people you may have missed" section.
 *
 * Data flow, single-shot on mount (plus refresh on edit):
 *   1. listEncountersForEvent — the user's own encounters (RLS).
 *   2. Fetch encountered profiles + their active posts (batched).
 *   3. Compute rationale via lib/opportunityMatch.
 *   4. Fetch the event's full attendee list to compute missed
 *      connections = attendees − (encountered + self).
 *
 * All work stays client-side; no new API routes.
 */
export default function EventRecapPage({
  eventId, event, allAttendees = [], onBackToOverview, onOpenMatch, onAddPeople,
}) {
  const { user, profile } = useAuth()

  const [encounters, setEncounters] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [postsByUserId, setPostsByUserId] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)     // { encounter, person }
  const [following, setFollowing] = useState(null) // { encounter, person, theirNeed, myOffer }
  const [addingAction, setAddingAction] = useState(null) // { encounter, person }

  async function refresh() {
    setLoading(true)
    const { data: encs } = await listEncountersForEvent(eventId)
    // Reconcile any acceptances that landed while we were away.
    await reconcileMyConfirmations((encs || []).map(e => e.id))
    // Re-pull if reconcile flipped anything (cheap, single query).
    const { data: encs2 } = await listEncountersForEvent(eventId)
    const list = encs2 || encs || []
    setEncounters(list)

    if (list.length === 0) { setLoading(false); return }

    // Batch-load target profiles + active posts.
    const ids = Array.from(new Set(list.map(e => e.encountered_user_id).filter(Boolean)))
    if (ids.length === 0) { setLoading(false); return }
    const [{ data: profiles }, { data: posts }] = await Promise.all([
      supabase.from('profiles')
        .select('id, name, avatar_url, program, headline, career_stage, industry_interests, can_help_with, skills_to_learn, visibility')
        .in('id', ids),
      supabase.from('posts')
        .select('id, created_by, need_text, offer_text, help_type, industry_tag, created_at')
        .in('created_by', ids)
        .order('created_at', { ascending: false }),
    ])
    const pById = Object.fromEntries((profiles || []).map(p => [p.id, p]))
    const postsBy = {}
    for (const p of (posts || [])) {
      if (!postsBy[p.created_by]) postsBy[p.created_by] = []
      postsBy[p.created_by].push(p)
    }
    setProfilesById(pById)
    setPostsByUserId(postsBy)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compose display entries — one per encounter, enriched with
  // profile + top-post + rationale. Ranked by connection value.
  const entries = useMemo(() => {
    const list = encounters.map(enc => {
      const them        = profilesById[enc.encountered_user_id] || {}
      const themPosts   = postsByUserId[enc.encountered_user_id] || []
      const rationale   = whyThisConnectionMayMatter({
        them, themProfile: them, themPosts, meProfile: profile,
      })
      return { encounter: enc, them, themPosts, rationale }
    })
    return rankByConnectionValue(
      list.map(l => ({ ...l, themProfile: l.them })),
      profile,
    )
  }, [encounters, profilesById, postsByUserId, profile])


  const stats = useMemo(() => ({
    total:       entries.length,
    confirmed:   entries.filter(e => e.encounter.status === 'mutually_confirmed').length,
    messagesSent: entries.filter(e => e.encounter.message_status === 'sent').length,
    openActions: entries.filter(e => e.encounter.next_action && !e.encounter.followed_up_at && !e.encounter.followup_dismissed_at).length,
  }), [entries])

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '18px 20px 8px' }}>
        <button
          type="button"
          onClick={onBackToOverview}
          style={{
            background: 'transparent', border: 'none', padding: 0,
            fontSize: 12, fontWeight: 500, color: C.goldDark,
            cursor: 'pointer', marginBottom: 10,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          ← Back to event
        </button>
        <p style={{
          fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
          fontWeight: 700, color: C.gold, margin: 0,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          Your Event Recap
        </p>
        <h1 className="font-display" style={{
          fontSize: 22, fontWeight: 600, color: C.text,
          margin: '4px 0 6px', letterSpacing: '-0.01em',
        }}>
          Event recap
        </h1>
        <p style={{
          fontSize: 13, color: C.text, fontWeight: 600,
          fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
        }}>
          {stats.total} {stats.total === 1 ? 'person' : 'people'} met · {stats.openActions} follow-up{stats.openActions === 1 ? '' : 's'} due
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-5 pb-10"
      >
        {loading && (
          <p style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', padding: '24px 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
            Loading recap…
          </p>
        )}

        {!loading && entries.length === 0 && (
          <div className="rounded-2xl p-5 mb-4 text-center" style={{ background: C.white, border: `1px solid ${C.border}` }}>
            <p style={{ fontSize: 15, fontWeight: 650, color: C.text, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
              Who did you meet at {event?.title || 'this event'}?
            </p>
            <p style={{ fontSize: 12.5, color: C.textSub, margin: '5px 0 0', lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
              Pick the attendees you spoke with to remember the conversation.
            </p>
            {onAddPeople && (
              <button type="button" onClick={onAddPeople}
                style={{ marginTop: 14, padding: '11px 18px', borderRadius: 11, border: 'none', background: '#C9A33B', color: '#2E2405', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                Choose from attendees
              </button>
            )}
          </div>
        )}

        {entries.map(({ encounter, them, themPosts, rationale }) => (
          <EncounterCard
            key={encounter.id}
            encounter={encounter}
            them={them}
            themTopPost={themPosts[0]}
            myProfile={profile}
            rationale={rationale}
            onEdit={() => setEditing({
              encounter,
              person: { name: them.name, program: them.program, avatarUrl: them.avatar_url },
            })}
            onFollowUp={() => setFollowing({
              encounter,
              person: { name: them.name, program: them.program },
              theirNeed: themPosts[0]?.need_text || null,
              myOffer:   pickBestOffer(profile, themPosts[0]?.need_text),
            })}
            onUndo={async () => { await unmarkEncounterFollowedUp(encounter.id); refresh() }}
            onAddAction={() => setAddingAction({
              encounter,
              person: { name: them.name || encounter.person_name },
            })}
            onMessage={async () => {
              if (!encounter.encountered_user_id || !user?.id) return
              const { matchId } = await openOrCreateDirectMatch({ myId: user.id, peerId: encounter.encountered_user_id, eventId })
              if (matchId) onOpenMatch?.(matchId)
            }}
            onRemove={async () => {
              if (!window.confirm('Remove this person from your recap? Your note and topics for them will be deleted.')) return
              await deleteEncounter(encounter.id); refresh()
            }}
          />
        ))}

        {entries.length > 0 && onAddPeople && (
          <button type="button" onClick={onAddPeople}
            style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', padding: '4px 0 6px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: C.goldDark, fontFamily: 'Inter, system-ui, sans-serif' }}>
            + Add someone I met
          </button>
        )}

      </motion.div>

      <EventMemoryModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        person={editing?.person || {}}
        initialTopics={editing?.encounter?.topics || []}
        initialNote={editing?.encounter?.private_note || ''}
        onSave={async ({ topics, privateNote }) => {
          const { error } = await updateEncounter(editing.encounter.id, { topics, privateNote })
          if (!error) refresh()
          return { error }
        }}
        onDelete={async () => {
          const { error } = await deleteEncounter(editing.encounter.id)
          if (!error) refresh()
          return { error }
        }}
      />

      <FollowUpModal
        open={Boolean(following)}
        onClose={() => setFollowing(null)}
        encounter={following?.encounter}
        person={following?.person}
        eventTitle={event?.title}
        theirNeed={following?.theirNeed}
        myOffer={following?.myOffer}
        onFollowedUp={refresh}
      />

      <NextActionModal
        open={Boolean(addingAction)}
        onClose={() => setAddingAction(null)}
        person={addingAction?.person}
        encounter={addingAction?.encounter}
        onSave={async ({ nextAction, dueAt }) => {
          const { error } = await addFollowup(addingAction.encounter.id, { nextAction, dueAt })
          if (!error) refresh()
          return { error }
        }}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// NextActionModal — capture a concrete next action (task/commitment).
// This is NOT a message; it never touches message_status.
// ────────────────────────────────────────────────────────────────

function NextActionModal({ open, onClose, person, encounter, onSave }) {
  const [action, setAction] = useState('')
  const [due, setDue]       = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setAction(encounter?.next_action || '')
      setDue(encounter?.due_at ? new Date(encounter.due_at).toISOString().slice(0, 10) : '')
      setSaving(false)
    }
  }, [open, encounter?.next_action, encounter?.due_at])

  if (!open) return null

  const handleSave = async () => {
    if (!action.trim()) return
    setSaving(true)
    const { error } = await onSave?.({ nextAction: action.trim(), dueAt: due || null })
    setSaving(false)
    if (error) { alert('Could not save: ' + (error.message || 'unknown')); return }
    onClose?.()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(17,17,17,0.45)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 61,
        background: C.white, borderRadius: '24px 24px 0 0',
        padding: '18px 24px calc(20px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
        </div>
        <p style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: C.gold, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
          Next action
        </p>
        <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20, fontWeight: 600, color: C.text, margin: '4px 0 2px' }}>
          {person?.name ? `Follow through with ${person.name}` : 'Add a next action'}
        </h2>
        <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 14px', fontFamily: 'Inter, system-ui, sans-serif' }}>
          A concrete task you'll do — separate from any message. It shows up in My Networking → Open next actions.
        </p>

        <label style={{ fontSize: 12, fontWeight: 600, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>What will you do?</label>
        <input
          value={action}
          onChange={e => setAction(e.target.value)}
          placeholder="e.g. Send the deck · Intro to Priya · Book coffee"
          style={{ width: '100%', marginTop: 6, padding: '11px 13px', borderRadius: 12, border: `1.5px solid ${C.border}`, background: '#FAFAFA', color: C.text, fontSize: 14, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none' }}
        />

        <label style={{ display: 'block', marginTop: 12, fontSize: 12, fontWeight: 600, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>Due date (optional)</label>
        <input
          type="date"
          value={due}
          onChange={e => setDue(e.target.value)}
          style={{ width: '100%', marginTop: 6, padding: '11px 13px', borderRadius: 12, border: `1.5px solid ${C.border}`, background: '#FAFAFA', color: C.text, fontSize: 14, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none' }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 12, background: C.white, color: C.textSub, border: `1.5px solid ${C.border}`, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !action.trim()} style={{ flex: 2, padding: '12px', borderRadius: 12, background: !action.trim() ? '#E5E7EB' : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, color: !action.trim() ? C.textMuted : '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: saving || !action.trim() ? 'default' : 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
            {saving ? 'Saving…' : 'Save next action'}
          </button>
        </div>
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────
// EncounterCard
// ────────────────────────────────────────────────────────────────

function EncounterCard({ encounter, them, themTopPost, rationale, onEdit, onFollowUp, onUndo, onMessage, onAddAction, onRemove }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const msgState = encounter.message_status || 'none'  // none | draft | sent | dismissed
  const sentDate = encounter.message_sent_at ? new Date(encounter.message_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
  // Next action (task/commitment) is independent of the message above.
  const hasAction   = Boolean((encounter.next_action || '').trim())
  const actionState = !hasAction ? 'none'
                    : encounter.followed_up_at ? 'completed'
                    : encounter.followup_dismissed_at ? 'dismissed'
                    : 'pending'
  const seed = resolveAvatarSeed(them.avatar_url) || them.id || encounter.encountered_user_id || encounter.id || 'anon'
  const roleLine = [them.program, them.headline, them.career_stage].filter(Boolean).join(' · ')
  const status = encounter.status
  return (
    <div
      className="rounded-2xl p-4 mb-3"
      style={{ background: C.white, border: `1px solid ${C.border}` }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <AnonymousAvatar seed={seed} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 15, fontWeight: 600, color: C.text, margin: 0,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {them.name || encounter.person_name || 'Member'}
          </p>
          {roleLine && (
            <p style={{
              fontSize: 12, color: C.textMuted, margin: '2px 0 0',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              {roleLine}
            </p>
          )}
          {status === 'mutually_confirmed' && (
            <span style={{
              display: 'inline-block', marginTop: 6,
              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 99,
              background: C.okBg, color: C.ok, border: `1px solid ${C.okBorder}`,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              ✓ Confirmed
            </span>
          )}
          {status === 'confirmation_requested' && (
            <span style={{
              display: 'inline-block', marginTop: 6,
              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 99,
              background: '#EEF2FF', color: '#4338CA', border: `1px solid #C7D2FE`,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              Awaiting confirm
            </span>
          )}
        </div>
      </div>

      {(themTopPost?.need_text || themTopPost?.offer_text) && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid #F3F4F6` }}>
          {themTopPost.need_text && (
            <p style={{ fontSize: 12.5, color: C.textSub, lineHeight: 1.5, margin: '0 0 4px', fontFamily: 'Inter, system-ui, sans-serif' }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.goldDark, marginRight: 6 }}>
                Looking for
              </span>
              {themTopPost.need_text}
            </p>
          )}
          {themTopPost.offer_text && (
            <p style={{ fontSize: 12.5, color: C.textSub, lineHeight: 1.5, margin: '0 0 4px', fontFamily: 'Inter, system-ui, sans-serif' }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.goldDark, marginRight: 6 }}>
                Offering
              </span>
              {themTopPost.offer_text}
            </p>
          )}
        </div>
      )}

      {encounter.topics?.length > 0 && (
        <p style={{ fontSize: 12, color: C.textMuted, margin: '10px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <span style={{ fontWeight: 600, color: C.textSub }}>You discussed:</span>{' '}
          {encounter.topics.join(', ')}
        </p>
      )}

      {encounter.private_note && (
        <p style={{
          marginTop: 8, padding: '8px 10px',
          background: C.goldBg, border: `1px solid ${C.goldLight}`,
          borderRadius: 10,
          fontSize: 12, color: C.text, lineHeight: 1.5,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          <strong style={{ color: C.goldDark, fontWeight: 700 }}>Your note:</strong>{' '}
          {encounter.private_note}
        </p>
      )}

      {/* Status lines (informational — one small line each, not buttons). */}
      {msgState === 'sent' && (
        <p style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: C.ok, fontFamily: 'Inter, system-ui, sans-serif' }}>
          ✓ Message sent{sentDate ? ` · ${sentDate}` : ''}
        </p>
      )}
      {actionState !== 'none' && (
        <p style={{ marginTop: msgState === 'sent' ? 4 : 10, fontSize: 12, fontWeight: 600, color: actionState === 'completed' ? C.ok : actionState === 'dismissed' ? C.textMuted : C.goldDark, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {actionState === 'completed' ? '✓ Next action done'
            : actionState === 'dismissed' ? 'Next action dismissed'
            : `→ Next action: ${encounter.next_action}`}
        </p>
      )}

      {/* One primary action + a ••• overflow — not four equal buttons. */}
      <div style={{ position: 'relative', display: 'flex', gap: 8, marginTop: 12, alignItems: 'stretch' }}>
        <button type="button" onClick={onFollowUp} className="active:scale-[0.98]"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: '#C9A33B', color: '#2E2405', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Follow up
        </button>
        <button type="button" onClick={() => setMenuOpen(o => !o)} aria-label="More options"
          style={{ width: 42, borderRadius: 10, background: C.white, border: `1px solid ${C.border}`, color: C.textSub, fontSize: 16, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>
          ⋯
        </button>
        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
            <div style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 6px)', zIndex: 21, minWidth: 190, background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 8px 26px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
              <MenuItem onClick={() => { setMenuOpen(false); onEdit() }}>Edit note</MenuItem>
              <MenuItem onClick={() => { setMenuOpen(false); onAddAction() }}>{actionState === 'pending' ? 'Edit next action' : 'Add next action'}</MenuItem>
              {them.id && <MenuItem onClick={() => { setMenuOpen(false); onMessage() }}>Open chat</MenuItem>}
              <MenuItem danger onClick={() => { setMenuOpen(false); onRemove?.() }}>Remove from recap</MenuItem>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MenuItem({ children, onClick, danger }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', background: '#fff', border: 'none', borderBottom: '1px solid #F3EFE8', fontSize: 13, fontWeight: 500, color: danger ? '#B4453A' : '#1A1712', cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {children}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

// Given my profile + the target's top need_text, return the best
// short "what I offer" phrase to slot into the follow-up message.
// Prefers a can_help_with keyword that appears in their need_text,
// otherwise falls back to the first can_help_with entry.
function pickBestOffer(myProfile, theirNeed) {
  const helps = myProfile?.can_help_with || []
  if (helps.length === 0) return null
  if (!theirNeed) return helps[0]
  const match = helps.find(kw => new RegExp(`\\b${kw}\\b`, 'i').test(theirNeed))
  return match || helps[0]
}
