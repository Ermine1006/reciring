import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import SettingsPage from './SettingsPage'
import SettingsTab from './SettingsTab'
import PendingReviewsList from './PendingReviewsList'
import RatingReview from './RatingReview'
import LeaderboardView from './LeaderboardView'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#F0ECE4',
}

// Sub-tab labels are short on purpose so all 4 fit on one row inside the
// segmented control without overflow. The parent "Profile" bottom-tab
// gives context (e.g. "Profile > Rank" reads naturally).
const SUB_TABS = [
  { id: 'profile',     label: 'Profile'  },
  { id: 'reviews',     label: 'Reviews'  },
  { id: 'leaderboard', label: 'Rank'     },
  { id: 'settings',    label: 'Settings' },
]

/**
 * ProfilePage — container for the bottom-nav "Profile" tab.
 *
 * Sub-tabs:
 *   My Profile  → SettingsPage (the editor)
 *   Reviews     → PendingReviewsList + RatingReview flow
 *   Leaderboard → LeaderboardView
 *   Settings    → SettingsTab (email prefs, admin, account)
 *
 * The "Reviews" sub-tab still cooperates with App.jsx's reviewMatchId
 * state so that ChatView can deep-link from "Review user" — App sets
 * tab='profile' and subTab='reviews' and reviewMatchId together.
 */
export default function ProfilePage({
  // Sub-tab routing (lifted to App so chat→review deep-links work)
  subTab,
  onSubTabChange,
  // Reviews sub-tab
  pendingReviewMatches,
  pastReviews,
  allMatches,
  reviewMatchId,
  onSelectReviewMatch,
  onClearReviewMatch,
  onSubmitReview,
  // Settings sub-tab
  onOpenAdminEmailTest,
}) {
  // If parent didn't supply controlled state, fall back to local.
  const [localSub, setLocalSub] = useState('profile')
  const active = subTab ?? localSub
  const setActive = (id) => {
    if (onSubTabChange) onSubTabChange(id)
    else                setLocalSub(id)
  }

  // Switching away from Reviews while a specific match was being
  // rated should clear that selection so the next visit starts fresh.
  useEffect(() => {
    if (active !== 'reviews' && reviewMatchId) onClearReviewMatch?.()
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      style={{ background: '#F9F7F4' }}
    >
      {/* Page header — non-scrolling */}
      <div style={{
        flexShrink: 0,
        padding: '20px 20px 14px',
        background: '#F9F7F4',
      }}>
        <h1 className="font-display" style={{
          fontSize: 22, fontWeight: 600, color: C.text,
          margin: 0, letterSpacing: '-0.01em',
        }}>
          Profile
        </h1>

        {/* Segmented control — all 4 sub-tabs in one rounded container,
              each takes equal width so the row never overflows. */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            marginTop: 14,
            background: '#F2EEE5',
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 3,
            gap: 2,
          }}
        >
          {SUB_TABS.map(t => {
            const isActive = active === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(t.id)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '8px 6px',
                  borderRadius: 9,
                  background: isActive ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : 'transparent',
                  color: isActive ? '#fff' : C.textSub,
                  border: 'none',
                  fontSize: 12, fontWeight: 600,
                  letterSpacing: '0.02em',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 1px 4px rgba(200,169,106,0.35)' : 'none',
                  transition: 'all 0.18s',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active sub-tab body — this is the SINGLE scroll container for
          the Profile tab. Sub-tab content (SettingsPage, etc.) renders
          inside as plain blocks; do NOT nest another phone-scroll here
          or the inner content stops being scrollable (flex computes the
          inner child as flex:1 and ignores its overflowing content). */}
      <div className="flex-1 phone-scroll min-h-0">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          {active === 'profile' && <SettingsPage />}

          {active === 'reviews' && (
            <div className="px-2" style={{ padding: '0 0 16px' }}>
              {reviewMatchId ? (
                <RatingReview
                  matchId={reviewMatchId}
                  peerName={allMatches?.find(m => m.id === reviewMatchId)?.request?.needs?.slice(0, 30) || 'your match'}
                  onSubmitted={onSubmitReview}
                  onBack={onClearReviewMatch}
                />
              ) : (
                <PendingReviewsList
                  matches={pendingReviewMatches || []}
                  pastReviews={pastReviews || []}
                  allMatches={allMatches || []}
                  onSelect={onSelectReviewMatch}
                />
              )}
            </div>
          )}

          {active === 'leaderboard' && <LeaderboardView />}

          {active === 'settings' && (
            <div className="px-5 pt-3 pb-10">
              <SettingsTab onOpenAdminEmailTest={onOpenAdminEmailTest} />
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
