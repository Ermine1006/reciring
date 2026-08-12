import AnonymousAvatar from './AnonymousAvatar'
import { matchaCta } from '../lib/matchaCta'

// EventPostCard — ONE attendee's Event Post: their "Looking for" and
// "Can offer" shown together (grouped by user_id in the parent), never as
// two separate cards. One action per person. Identity stays anonymous
// (program + industry only) until an interest is accepted.

const C = {
  ground:'#FFFFFF', ivory:'#FBF8F3', ink:'#1A1712', ink2:'#5F584D', ink3:'#9A958B',
  line:'#ECE7DE', line2:'#F3EFE8', gold:'#A6822A', goldInk:'#7A5E17',
  goldBtn:'#C9A33B', goldBtnInk:'#2E2405', goldLine:'#E8D9A7',
  slate:'#4B5A8A', sage:'#2F7A55', danger:'#B4453A',
}

function anonName(program) {
  return program ? `Anonymous ${program} member` : 'Anonymous attendee'
}

function Section({ kind, post }) {
  const isNeed = kind === 'need'
  const text = post.description || post.title   // one clean text per section
  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: isNeed ? C.slate : C.sage, fontFamily: 'Inter, system-ui, sans-serif' }}>
        {isNeed ? 'Looking for' : 'Can offer'}
      </p>
      <p style={{ margin: '3px 0 0', fontSize: 13, color: C.ink, lineHeight: 1.4, fontFamily: 'Inter, system-ui, sans-serif' }}>{text}</p>
    </div>
  )
}

/**
 * @param {object} entry  { userId, program, headline, industry, need, offer }
 *   need / offer are the raw marketplace rows (or null).
 * @param {boolean} mine  the current user's own post
 * @param {object} myInterest  { status, match_id } if I've expressed interest
 * @param {number} interestCount / pendingCount  for my own post
 */
export default function EventPostCard({
  entry, mine = false, myInterest = null, interestCount = 0, pendingCount = 0,
  onInterested, onOpenChat, onManage, onEdit, onDelete,
}) {
  const { userId, program, headline, industry = [], need, offer } = entry
  const ind = Array.isArray(industry) ? industry[0] : industry
  const rep = need || offer            // representative post the interest anchors to

  return (
    <div style={{ background: C.ground, border: `1px solid ${C.line}`, borderRadius: 14, padding: '13px 14px' }}>
      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        {!mine && <AnonymousAvatar seed={userId || rep?.id || 'anon'} size={38} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          {mine ? (
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.gold, fontFamily: 'Inter, system-ui, sans-serif' }}>Your event post</p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 650, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>{anonName(program)}</p>
              {(headline || ind) && <p style={{ margin: '1px 0 0', fontSize: 12, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>{[headline, ind].filter(Boolean).join(' · ')}</p>}
            </>
          )}
        </div>
        {mine && (onEdit || onDelete) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onEdit && (
              <button type="button" onClick={onEdit} style={{ padding: '7px 13px', borderRadius: 9, background: C.ground, border: `1px solid ${C.goldLine}`, color: C.gold, fontSize: 12.5, fontWeight: 650, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>Edit</button>
            )}
            {onDelete && (
              <button type="button" onClick={onDelete} aria-label="Delete post" style={{ padding: '7px 9px', borderRadius: 9, background: C.ground, border: `1px solid ${C.line}`, color: C.ink3, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H6a1 1 0 01-1-1V6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* One card, both sections — only render a section that exists */}
      {need  && <Section kind="need"  post={need} />}
      {offer && <Section kind="offer" post={offer} />}

      {/* One action */}
      <div style={{ marginTop: 12 }}>
        {mine ? (
          <button type="button" onClick={onManage} style={{ ...primary, background: C.ivory, color: C.ink, border: `1px solid ${C.line}`, boxShadow: 'none' }}>
            {pendingCount > 0 ? `Review interest · ${pendingCount}` : `Interest · ${interestCount}`}
          </button>
        ) : myInterest?.status === 'accepted' && myInterest.match_id ? (
          <button type="button" onClick={() => onOpenChat?.(myInterest.match_id)} style={primary}>Open chat</button>
        ) : myInterest?.status === 'pending' ? (
          <button type="button" disabled style={{ ...primary, background: C.ivory, color: C.ink3, cursor: 'default', boxShadow: 'none' }}>✓ Interest sent</button>
        ) : myInterest?.status === 'declined' ? (
          <button type="button" disabled style={{ ...primary, background: C.ivory, color: C.ink3, cursor: 'default', boxShadow: 'none' }}>Not this time</button>
        ) : (
          <button type="button" onClick={() => onInterested?.(rep)} style={primary}>I'm interested</button>
        )}
      </div>
    </div>
  )
}

const primary = {
  width: '100%', padding: '10px 14px', borderRadius: 10, border: 'none',
  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
  ...matchaCta,
}
