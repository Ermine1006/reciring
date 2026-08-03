import AnonymousAvatar from './AnonymousAvatar'

const C = {
  gold: '#C8A96A', goldDark: '#A88245', goldLight: '#E6D3A3', goldBg: '#FBF6EC',
  ink: '#111111', textSub: '#6B7280', textMuted: '#9CA3AF', white: '#FFFFFF',
  border: '#F0ECE4', green: '#16A34A', greenBg: '#F0FDF4', greenBorder: '#BBF7D0',
  danger: '#DC2626',
}

// Friendly-ish program label. Values come from migration-program-options.sql.
function anonName(program) {
  if (!program) return 'Anonymous attendee'
  return `Anonymous ${program} student`
}

function TypeTag({ type }) {
  const need = type === 'need'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '5px 10px', borderRadius: 8, whiteSpace: 'nowrap',
      color: need ? C.goldDark : C.green,
      background: need ? C.goldBg : C.greenBg,
      border: `1px solid ${need ? C.goldLight : C.greenBorder}`,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {need ? 'Looking for' : 'Offering'}
    </span>
  )
}

function Chips({ items }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {items.slice(0, 6).map((t, i) => (
        <span key={i} style={{
          fontSize: 11, color: C.textSub, background: '#F5F3EF',
          border: `1px solid ${C.border}`, borderRadius: 999, padding: '3px 9px',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          {t}
        </span>
      ))}
    </div>
  )
}

/**
 * One marketplace post.
 *  - Browse mode (mine=false): fully anonymous — AnonymousAvatar + program +
 *    industry, never a name. Shows "I'm Interested" / "Interest sent" / "Open chat".
 *  - Owner mode (mine=true): your own post — interest count + Manage / Edit / Delete.
 */
export default function MarketplacePostCard({
  post, mine = false,
  myInterest = null,          // { status, match_id } if I already expressed interest
  interestCount = 0,          // for my own posts
  pendingCount = 0,
  onInterested, onOpenChat, onManage, onEdit, onDelete,
}) {
  const program  = mine ? null : post.poster_program
  const industry = Array.isArray(post.poster_industry) ? post.poster_industry : []
  const seed = post.id

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 16,
      padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
    }}>
      {/* Header: identity (anonymous) + type tag */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        {!mine && <AnonymousAvatar seed={seed} size={38} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          {mine ? (
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.gold, fontFamily: 'Inter, system-ui, sans-serif' }}>
              Your post
            </p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>
                {anonName(program)}
              </p>
              {(program || industry[0]) && (
                <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {[program, industry[0]].filter(Boolean).join(' · ')}
                </p>
              )}
            </>
          )}
        </div>
        <TypeTag type={post.type} />
      </div>

      {/* Single free-text body (unified format — no separate headline). Falls
          back to the derived title only for legacy posts with no description. */}
      <p style={{ margin: '12px 0 0', fontSize: 14.5, color: C.ink, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif', whiteSpace: 'pre-wrap' }}>
        {post.description || post.title}
      </p>

      <Chips items={post.tags} />

      {post.urgency && (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, fontWeight: 600, color: C.goldDark, fontFamily: 'Inter, system-ui, sans-serif' }}>
          ⏳ {post.urgency}
        </p>
      )}

      {/* Actions */}
      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        {mine ? (
          <>
            <button type="button" onClick={onManage} style={primaryBtn}>
              {pendingCount > 0 ? `Review interest · ${pendingCount}` : `Interest · ${interestCount}`}
            </button>
            <button type="button" onClick={onEdit} style={ghostBtn}>Edit</button>
            <button type="button" onClick={onDelete} style={{ ...ghostBtn, color: C.danger, borderColor: '#FECACA' }}>Delete</button>
          </>
        ) : myInterest?.status === 'accepted' && myInterest.match_id ? (
          <button type="button" onClick={() => onOpenChat?.(myInterest.match_id)} style={primaryBtn}>
            💬 Open chat
          </button>
        ) : myInterest?.status === 'pending' ? (
          <button type="button" disabled style={{ ...primaryBtn, background: '#F5F3EF', color: C.textSub, cursor: 'default', boxShadow: 'none' }}>
            ✓ Interest sent
          </button>
        ) : myInterest?.status === 'declined' ? (
          <button type="button" disabled style={{ ...primaryBtn, background: '#F5F3EF', color: C.textMuted, cursor: 'default', boxShadow: 'none' }}>
            Not this time
          </button>
        ) : (
          <button type="button" onClick={() => onInterested?.(post)} style={primaryBtn}>
            I'm Interested
          </button>
        )}
      </div>
    </div>
  )
}

const primaryBtn = {
  flex: 1, padding: '11px 14px', borderRadius: 12, border: 'none',
  background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, color: C.white,
  fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(200,169,106,0.32)',
  fontFamily: 'Inter, system-ui, sans-serif',
}

const ghostBtn = {
  padding: '11px 14px', borderRadius: 12, background: C.white,
  border: `1.5px solid ${C.border}`, color: C.ink,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'Inter, system-ui, sans-serif',
}
