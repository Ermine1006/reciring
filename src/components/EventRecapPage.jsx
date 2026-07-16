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
  reconcileMyConfirmations,
} from '../lib/eventEncounters'
import { whyThisConnectionMayMatter, rankByConnectionValue } from '../lib/opportunityMatch'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
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
  eventId, event, allAttendees = [], onBackToOverview,
}) {
  const { user, profile } = useAuth()

  const [encounters, setEncounters] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [postsByUserId, setPostsByUserId] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)     // { encounter, person }
  const [following, setFollowing] = useState(null) // { encounter, person, theirNeed, myOffer }

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
    const ids = Array.from(new Set(list.map(e => e.encountered_user_id)))
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

  // Missed connections: attendees the user hasn't met, ranked by
  // connection value (highest first). Cap at 5 so the section
  // doesn't dominate the recap.
  const missed = useMemo(() => {
    if (!allAttendees || allAttendees.length === 0) return []
    const metIds = new Set(encounters.map(e => e.encountered_user_id))
    if (user?.id) metIds.add(user.id)
    const candidates = allAttendees
      .filter(a => !metIds.has(a.user_id))
      .map(a => ({
        them: { id: a.user_id, name: a.name, avatar_url: a.avatar_url },
        themProfile: profilesById[a.user_id] || {
          id: a.user_id,
          industry_interests: [],
          can_help_with:      [],
        },
        themPosts: postsByUserId[a.user_id] || [],
      }))
    return rankByConnectionValue(candidates, profile)
      .map(c => ({ ...c, rationale: whyThisConnectionMayMatter({
        them: c.them, themProfile: c.themProfile, themPosts: c.themPosts, meProfile: profile,
      }) }))
      .filter(c => c.rationale) // only show if the matcher had SOMETHING to say
      .slice(0, 5)
  }, [allAttendees, encounters, profilesById, postsByUserId, profile, user?.id])

  const stats = useMemo(() => ({
    total:      entries.length,
    followedUp: entries.filter(e => e.encounter.followed_up_at).length,
    confirmed:  entries.filter(e => e.encounter.status === 'mutually_confirmed').length,
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
          You met {stats.total} {stats.total === 1 ? 'person' : 'people'}
          {event?.title ? ` at ${event.title}` : ''}
        </h1>
        <p style={{
          fontSize: 12.5, color: C.textSub,
          fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
        }}>
          {stats.confirmed} confirmed · {stats.followedUp} followed up
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
          <div
            className="rounded-2xl p-5 mb-4 text-center"
            style={{ background: C.white, border: `1px dashed ${C.border}` }}
          >
            <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.55, fontFamily: 'Inter, system-ui, sans-serif', margin: 0 }}>
              You haven't logged anyone yet. Open Event Mode from the event page and tap <strong style={{ color: C.text }}>I met this person</strong> next to attendees you spoke with.
            </p>
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
          />
        ))}

        {missed.length > 0 && (
          <div className="mt-4">
            <p style={{
              fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
              fontWeight: 700, color: C.gold, margin: '0 0 4px',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              People you may have missed
            </p>
            <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
              Ranked by relevance to your profile. Not tracked physically — these are simply attendees who overlap with what you're working on.
            </p>
            {missed.map(m => (
              <MissedCard key={m.them.id} entry={m} />
            ))}
          </div>
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
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// EncounterCard
// ────────────────────────────────────────────────────────────────

function EncounterCard({ encounter, them, themTopPost, rationale, onEdit, onFollowUp }) {
  const seed = resolveAvatarSeed(them.avatar_url) || them.id || encounter.encountered_user_id
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
            {them.name || 'Member'}
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

      {rationale && (
        <div style={{
          marginTop: 10, padding: '10px 12px',
          background: '#FAF7EE', border: `1px dashed ${C.goldLight}`, borderRadius: 10,
        }}>
          <p style={{
            fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase',
            fontWeight: 700, color: C.goldDark, margin: 0,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            Why this connection may matter
          </p>
          <p style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, margin: '4px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
            {rationale}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={onFollowUp}
          className="active:scale-[0.98]"
          style={{
            flex: 1, padding: '9px 12px', borderRadius: 10,
            background: encounter.followed_up_at ? C.okBg : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
            color: encounter.followed_up_at ? C.ok : '#fff',
            border: encounter.followed_up_at ? `1px solid ${C.okBorder}` : 'none',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
            cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {encounter.followed_up_at ? '✓ Followed up' : 'Generate follow-up'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          style={{
            padding: '9px 14px', borderRadius: 10,
            background: C.white, color: C.textSub,
            border: `1px solid ${C.border}`,
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          Edit
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// MissedCard
// ────────────────────────────────────────────────────────────────

function MissedCard({ entry }) {
  const { them, themProfile, themPosts, rationale } = entry
  const seed = resolveAvatarSeed(them.avatar_url) || them.id
  const top  = themPosts[0]
  return (
    <div
      className="rounded-2xl p-4 mb-2"
      style={{ background: C.white, border: `1px solid ${C.border}` }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <AnonymousAvatar seed={seed} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
            {them.name || 'Member'}
          </p>
          {themProfile.program && (
            <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
              {themProfile.program}
            </p>
          )}
        </div>
      </div>
      {rationale && (
        <p style={{ fontSize: 12, color: C.text, margin: '8px 0 0', lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {rationale}
        </p>
      )}
      {top?.need_text && (
        <p style={{ fontSize: 11.5, color: C.textSub, margin: '4px 0 0', lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
          <em>Currently looking for:</em> {top.need_text.slice(0, 100)}{top.need_text.length > 100 ? '…' : ''}
        </p>
      )}
    </div>
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
