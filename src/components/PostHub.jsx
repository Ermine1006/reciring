import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import SubmitRequest from './SubmitRequest'
import MyPostsPage from './MyPostsPage'
import AppScreen from './AppScreen'

const C = {
  gold:     '#C8A96A',
  goldDark: '#A88245',
  text:     '#111111',
  textSub:  '#6B7280',
  border:   '#E5E7EB',
  bg:       '#F9F7F4',
}

const TABS = [
  { id: 'create', label: 'Create request' },
  { id: 'manage', label: 'My posts' },
]

/**
 * PostHub — container for the bottom-nav "Post" tab.
 *
 * Wraps SubmitRequest (the create form) and MyPostsPage (manage own
 * requests) behind a top segmented control. Defaults to "Create
 * request". After a successful submission, auto-switches to "My posts"
 * and shows a brief success banner so the user sees their new post
 * land at the top of the list.
 */
export default function PostHub({
  myPosts,
  onCreatePost,
  onEditPost,
  onDeletePost,
  isSupabaseConfigured = false,
}) {
  const [subTab, setSubTab] = useState('create')
  const [justPosted, setJustPosted] = useState(false)

  const handleSubmitted = async (fields) => {
    const result = await onCreatePost(fields)
    if (result?.error) return result
    setSubTab('manage')
    setJustPosted(true)
    setTimeout(() => setJustPosted(false), 4000)
    return {}
  }

  return (
    <AppScreen scroll={false} background={C.bg}>
      {/* Top segmented control */}
      <div style={{ padding: '12px 16px 8px', flexShrink: 0, background: C.bg }}>
        <div
          role="tablist"
          style={{
            display: 'flex',
            background: '#F2EEE5',
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 3,
            gap: 2,
          }}
        >
          {TABS.map(t => {
            const active = subTab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSubTab(t.id)}
                style={{
                  flex: 1,
                  padding: '8px 6px',
                  borderRadius: 9,
                  background: active
                    ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`
                    : 'transparent',
                  color: active ? '#fff' : C.textSub,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: 'pointer',
                  boxShadow: active ? '0 1px 4px rgba(200,169,106,0.35)' : 'none',
                  transition: 'all 0.18s',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Success banner */}
        <AnimatePresence>
          {justPosted && subTab === 'manage' && (
            <motion.div
              key="just-posted"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              style={{
                marginTop: 10,
                padding: '10px 14px',
                background: 'rgba(34,197,94,0.10)',
                border: '1px solid rgba(34,197,94,0.30)',
                borderRadius: 10,
                color: '#166534',
                fontSize: 12,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 14 }}>✓</span>
              Your request is live. It's at the top of the list below.
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'create' && (
          <SubmitRequest onSubmitted={handleSubmitted} />
        )}
        {subTab === 'manage' && (
          <MyPostsPage
            posts={myPosts}
            onEditPost={onEditPost}
            onDeletePost={onDeletePost}
            onClose={() => setSubTab('create')}
            isSupabaseConfigured={isSupabaseConfigured}
          />
        )}
      </div>
    </AppScreen>
  )
}
