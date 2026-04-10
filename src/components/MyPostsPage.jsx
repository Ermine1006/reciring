import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HELP_TYPES, INDUSTRIES, TIME_OPTIONS } from '../data/requestOptions'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
  danger:    '#DC2626',
  warm:      '#8B6F47',
  warmDark:  '#3D3020',
  warmBg:    '#FAF6F0',
  warmBorder:'#E8DDD0',
}

const URGENCY_MAP = {
  urgent: { label: 'Urgent', color: '#991B1B' },
  soon:   { label: 'This week', color: '#92400E' },
}

const URGENCY_OPTIONS = [
  { value: null,     label: 'No rush' },
  { value: 'soon',   label: 'This week' },
  { value: 'urgent', label: 'Urgent' },
]

/* ── Chip selector (same style as SubmitRequest) ───────────────── */
function ChipGroup({ options, selected, onToggle, multi = false }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const value = typeof opt === 'string' ? opt : opt.value
        const label = typeof opt === 'string' ? opt : opt.label
        const active = multi ? (selected || []).includes(value) : selected === value
        return (
          <button
            key={label}
            type="button"
            onClick={() => onToggle(value)}
            className="px-3 py-[6px] rounded-full text-[11px] font-medium tracking-wide transition-all duration-150 active:scale-95"
            style={{
              background: active ? C.goldBg : C.white,
              border: active ? `1.5px solid ${C.gold}` : `1.5px solid ${C.border}`,
              color: active ? C.goldDark : C.textSub,
              boxShadow: active ? '0 2px 6px rgba(200,169,106,0.18)' : 'none',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Edit Post Modal ───────────────────────────────────────────── */
function EditPostModal({ post, onSave, onClose }) {
  // Posts arrive in card-mapped shape; derive help_type vs industry from tags
  const initHelpType = (post.tags || []).filter(t => HELP_TYPES.includes(t))
  const initIndustry = (post.tags || []).filter(t => INDUSTRIES.includes(t))

  const [needText, setNeedText]     = useState(post.needs || '')
  const [offerText, setOfferText]   = useState(post.offers || '')
  const [helpType, setHelpType]     = useState(initHelpType)
  const [industry, setIndustry]     = useState(initIndustry)
  const [time, setTime]             = useState(post.time || '15 min')
  const [urgency, setUrgency]       = useState(post.urgency || null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)

  const canSave = needText.trim().length > 0 && offerText.trim().length > 0 && helpType.length > 0

  const toggleMulti = (list, setList, max) => (val) => {
    setList(prev => prev.includes(val)
      ? prev.filter(v => v !== val)
      : prev.length < max ? [...prev, val] : prev
    )
  }

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true); setError(null)
    const { error: err } = await onSave({
      need_text:       needText.trim(),
      offer_text:      offerText.trim(),
      help_type:       helpType,
      industry_tag:    industry,
      time_commitment: time,
      urgency,
      is_anonymous:    true,
    })
    setSaving(false)
    if (err) setError(err.message || 'Failed to save.')
    // onSave closes the modal on success
  }

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="edit-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Sheet */}
      <motion.div
        key="edit-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 61,
          maxHeight: '92%',
          background: C.white,
          borderRadius: '24px 24px 0 0',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 24px 12px', flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text }}>Edit post</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: 13, fontWeight: 500, color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>

        {/* Scrollable form */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 24px 8px' }}>

          {/* Help type */}
          <div style={{ marginBottom: 14 }}>
            <p className="text-[11px] tracking-[0.14em] uppercase font-semibold mb-2" style={{ color: C.textSub }}>
              Help type <span style={{ color: '#EF4444' }}>*</span>
            </p>
            <ChipGroup
              options={HELP_TYPES}
              selected={helpType}
              onToggle={toggleMulti(helpType, setHelpType, 3)}
              multi
            />
          </div>

          {/* Industry */}
          <div style={{ marginBottom: 14 }}>
            <p className="text-[11px] tracking-[0.14em] uppercase font-semibold mb-2" style={{ color: C.textSub }}>
              Industry <span className="normal-case tracking-normal font-normal" style={{ color: C.textMuted }}>optional</span>
            </p>
            <ChipGroup
              options={INDUSTRIES}
              selected={industry}
              onToggle={toggleMulti(industry, setIndustry, 2)}
              multi
            />
          </div>

          {/* Time + Urgency */}
          <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 14 }}>
            <div>
              <p className="text-[11px] tracking-[0.14em] uppercase font-semibold mb-2" style={{ color: C.textSub }}>Time</p>
              <ChipGroup options={TIME_OPTIONS} selected={time} onToggle={setTime} />
            </div>
            <div>
              <p className="text-[11px] tracking-[0.14em] uppercase font-semibold mb-2" style={{ color: C.textSub }}>Urgency</p>
              <ChipGroup options={URGENCY_OPTIONS} selected={urgency} onToggle={setUrgency} />
            </div>
          </div>

          {/* What you need */}
          <div style={{ marginBottom: 14 }}>
            <label className="block text-[11px] tracking-[0.14em] uppercase font-semibold mb-2" style={{ color: C.textSub }}>
              What you need <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <textarea
              value={needText}
              onChange={e => setNeedText(e.target.value.slice(0, 260))}
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-sm resize-none"
              style={{ background: '#FAFAFA', border: `1.5px solid ${C.border}`, color: C.text, outline: 'none', lineHeight: 1.6 }}
            />
            <div className="flex justify-end mt-0.5">
              <span className="text-[10px]" style={{ color: C.textMuted }}>{needText.length}/260</span>
            </div>
          </div>

          {/* What you offer */}
          <div style={{ marginBottom: 14 }}>
            <label className="block text-[11px] tracking-[0.14em] uppercase font-semibold mb-2" style={{ color: C.textSub }}>
              What you offer <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <textarea
              value={offerText}
              onChange={e => setOfferText(e.target.value.slice(0, 200))}
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-sm resize-none"
              style={{ background: '#FAFAFA', border: `1.5px solid ${C.border}`, color: C.text, outline: 'none', lineHeight: 1.6 }}
            />
            <div className="flex justify-end mt-0.5">
              <span className="text-[10px]" style={{ color: C.textMuted }}>{offerText.length}/200</span>
            </div>
          </div>
        </div>

        {/* Footer: error + save */}
        <div style={{ flexShrink: 0, padding: '12px 24px 24px', borderTop: '1px solid rgba(200,169,106,0.12)' }}>
          {error && (
            <p className="text-center text-xs mb-3" style={{ color: C.danger }}>{error}</p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full py-3.5 rounded-xl text-sm font-semibold active:scale-[0.98]"
            style={{
              background: canSave ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : '#F3F4F6',
              color: canSave ? '#fff' : C.textMuted,
              border: 'none',
              opacity: saving ? 0.6 : 1,
              boxShadow: canSave ? '0 6px 20px rgba(200,169,106,0.35)' : 'none',
            }}
          >
            {saving ? 'Saving & republishing…' : 'Save & republish'}
          </button>
          <p className="text-center mt-2" style={{ fontSize: 10, color: C.textMuted }}>
            Republishing moves your post to the top of Discover.
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ── Main: My Posts Page ───────────────────────────────────────── */
export default function MyPostsPage({ 
  posts = [],
  onEditPost,
  onDeletePost,
  onClose,
  loading = false,
  error = null,
  isSupabaseConfigured = false,
}) {
  const [deleting, setDeleting]       = useState(null)
  const [editingPost, setEditingPost] = useState(null)

  const handleDelete = async (postId) => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    setDeleting(postId)
    const { error } = await onDeletePost(postId)
    if (error) alert('Failed to delete: ' + (error.message || 'Unknown error'))
    setDeleting(null)
  }

  const handleEditSave = async (fields) => {
    if (!editingPost) return { error: new Error('No post selected.') }
    const result = await onEditPost(editingPost.id, fields)
    if (!result.error) setEditingPost(null)
    return result
  }

  return (
    <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4', position: 'relative' }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-5 pt-5 pb-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h1 style={{ fontSize: 22, fontWeight: 600, color: C.text }}>My Posts</h1>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium"
            style={{ color: C.goldDark }}
          >
            Done
          </button>
        </div>
        <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
          Manage, edit, or republish your requests.
        </p>

        {posts.length === 0 && (
          <div className="text-center py-12">
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: C.goldBg, border: `1.5px solid ${C.goldLight}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="24" height="24" fill="none" stroke={C.gold} viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V9a2 2 0 012-2h2a2 2 0 012 2v9a2 2 0 01-2 2h-2z" />
              </svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>No posts yet</p>
            <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5 }}>
              When you post a request, it will appear here.
            </p>
          </div>
        )}

        {/* Post list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {posts.map(post => {
            const urg = post.urgency ? URGENCY_MAP[post.urgency] : null
            return (
              <div
                key={post.id}
                className="rounded-2xl overflow-hidden"
                style={{
                  background: C.white,
                  border: `1px solid ${C.border}`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                {/* Accent stripe */}
                <div style={{
                  height: 3,
                  background: `linear-gradient(90deg, transparent, ${C.goldLight}, ${C.gold}, transparent)`,
                }} />

                <div style={{ padding: '14px 18px 16px' }}>
                  {/* Meta row */}
                  <div className="flex items-center flex-wrap" style={{ gap: 5, marginBottom: 10 }}>
                    <span style={{
                      background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                      color: '#fff', borderRadius: 99, padding: '3px 10px',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    }}>
                      {post.category || 'Other'}
                    </span>
                    {post.time && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#1A1A1A', color: '#fff',
                        borderRadius: 99, padding: '3px 9px', fontSize: 10, fontWeight: 600,
                      }}>
                        {post.time}
                      </span>
                    )}
                    {urg && (
                      <span style={{
                        background: urg.color, color: '#fff',
                        borderRadius: 99, padding: '3px 9px', fontSize: 10, fontWeight: 700,
                      }}>
                        {urg.label}
                      </span>
                    )}
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 10, color: C.textMuted }}>
                      {post.createdAt}
                    </span>
                  </div>

                  {/* Need */}
                  <p style={{
                    fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.45,
                    marginBottom: 6,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {post.needs}
                  </p>

                  {/* Offer */}
                  <p style={{
                    fontSize: 12, color: C.textSub, lineHeight: 1.5, marginBottom: 8,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.warmDark, marginRight: 5 }}>
                      Offering:
                    </span>
                    {post.offers}
                  </p>

                  {/* Tags */}
                  {post.tags?.length > 0 && (
                    <div className="flex flex-wrap" style={{ gap: 4, marginBottom: 10 }}>
                      {post.tags.map(t => (
                        <span key={t} style={{
                          fontSize: 9, fontWeight: 500, color: C.textSub,
                          background: '#F5F3F0', border: '1px solid #EDE9E3',
                          borderRadius: 99, padding: '2px 8px',
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setEditingPost(post)}
                      style={{
                        padding: '6px 14px', borderRadius: 99,
                        border: `1.5px solid ${C.goldLight}`,
                        background: 'transparent',
                        color: C.goldDark, fontSize: 11, fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(post.id)}
                      disabled={deleting === post.id}
                      style={{
                        padding: '6px 14px', borderRadius: 99,
                        border: `1px solid ${C.danger}33`,
                        background: 'transparent',
                        color: C.danger, fontSize: 11, fontWeight: 600,
                        cursor: 'pointer',
                        opacity: deleting === post.id ? 0.5 : 1,
                      }}
                    >
                      {deleting === post.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* Edit modal */}
      {editingPost && (
        <EditPostModal
          post={editingPost}
          onSave={handleEditSave}
          onClose={() => setEditingPost(null)}
        />
      )}
    </div>
  )
}
