import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  fetchNotifications,
  fetchUnreadCount,
  markRead,
  markAllRead,
  subscribeNotifications,
  formatNotificationTime,
} from '../lib/notifications'

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
  red:       '#EF4444',
}

const TYPE_ICONS = {
  new_match:         '🤝',
  new_message:       '💬',
  feedback_request:  '⭐',
  meeting_confirmed: '📅',
  review_received:   '✨',
}

export default function NotificationBell({ userId, onOpenNotification }) {
  const [open, setOpen]               = useState(false)
  const [items, setItems]             = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [hovered, setHovered]         = useState(false)
  const dirtyRef = useRef(false) // true when items list is stale and needs refetch on next open

  // Initial load: just the unread count for the badge
  const refreshCount = useCallback(async () => {
    if (!userId) return
    const { count } = await fetchUnreadCount(userId)
    setUnreadCount(count)
  }, [userId])

  useEffect(() => { refreshCount() }, [refreshCount])

  // Realtime: badge increments on insert, syncs on read
  useEffect(() => {
    if (!userId) return
    const channel = subscribeNotifications(userId, {
      onInsert: (row) => {
        setUnreadCount(c => c + 1)
        // If dropdown is open, prepend; otherwise mark items stale for next open
        setItems(prev => open ? [row, ...prev] : prev)
        if (!open) dirtyRef.current = true
      },
      onUpdate: (row) => {
        // Reflect read_at changes (e.g. mark-all from another tab)
        setItems(prev => prev.map(n => n.id === row.id ? row : n))
        if (row.read_at) refreshCount()
      },
    })
    return () => { if (channel) channel.unsubscribe() }
  }, [userId, open, refreshCount])

  // Open the dropdown — fetch items if stale or empty
  const handleToggle = async () => {
    const next = !open
    setOpen(next)
    if (next && (dirtyRef.current || items.length === 0)) {
      const { data } = await fetchNotifications(userId, { limit: 20 })
      setItems(data)
      dirtyRef.current = false
    }
  }

  const handleMarkAll = async () => {
    if (unreadCount === 0) return
    // Optimistic
    const now = new Date().toISOString()
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }))
    setUnreadCount(0)
    await markAllRead(userId)
  }

  const handleClickItem = async (n) => {
    if (!n.read_at) {
      // Optimistic
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      setUnreadCount(c => Math.max(0, c - 1))
      markRead(n.id)
    }
    setOpen(false)
    onOpenNotification?.(n)
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* Bell button */}
      <button
        type="button"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleToggle}
        aria-label="Notifications"
        className="active:scale-95"
        style={{
          width: 42, height: 42,
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          background: hovered ? C.goldBg : 'transparent',
          border: `1.5px solid ${hovered ? C.goldLight : 'transparent'}`,
          transition: 'all 0.18s ease',
          position: 'relative',
        }}
      >
        <svg width="20" height="20" fill="none" stroke={hovered ? C.goldDark : C.text} strokeWidth={1.7} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            minWidth: 18, height: 18,
            padding: '0 5px',
            borderRadius: 9,
            background: C.red,
            color: '#fff',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
            border: '1.5px solid #fff',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <div
              onClick={() => setOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 39 }}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.16 }}
              style={{
                position: 'absolute', right: 0, top: 48, zIndex: 40,
                background: '#FFFFFF',
                borderRadius: 18,
                boxShadow: '0 12px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)',
                border: `1px solid ${C.border}`,
                overflow: 'hidden',
                width: 340,
                maxHeight: 460,
                display: 'flex', flexDirection: 'column',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: `1px solid ${C.border}`,
              }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Notifications
                </p>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAll}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600, color: C.gold,
                      padding: 0,
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {items.length === 0 ? (
                  <div style={{ padding: '36px 24px', textAlign: 'center' }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      background: C.goldBg, border: `1px solid ${C.goldLight}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 12px', fontSize: 22,
                    }}>
                      🔔
                    </div>
                    <p style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
                      No notifications yet
                    </p>
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {items.map(n => (
                      <li
                        key={n.id}
                        onClick={() => handleClickItem(n)}
                        style={{
                          padding: '12px 18px',
                          display: 'flex', gap: 12,
                          cursor: 'pointer',
                          background: n.read_at ? 'transparent' : C.goldBg,
                          borderBottom: `1px solid ${C.border}`,
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = n.read_at ? '#FAFAF8' : '#F5EFDF'}
                        onMouseLeave={(e) => e.currentTarget.style.background = n.read_at ? 'transparent' : C.goldBg}
                      >
                        <div style={{
                          flexShrink: 0,
                          width: 32, height: 32,
                          borderRadius: '50%',
                          background: C.white,
                          border: `1px solid ${C.goldLight}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 15,
                        }}>
                          {TYPE_ICONS[n.type] || '•'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <p style={{
                              fontSize: 13, fontWeight: 600, color: C.text,
                              fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
                            }}>
                              {n.title}
                            </p>
                            <p style={{
                              fontSize: 10, color: C.textMuted,
                              fontFamily: 'Inter, system-ui, sans-serif',
                              flexShrink: 0, marginTop: 2,
                            }}>
                              {formatNotificationTime(n.created_at)}
                            </p>
                          </div>
                          {n.body && (
                            <p style={{
                              fontSize: 12, color: C.textSub, lineHeight: 1.4,
                              fontFamily: 'Inter, system-ui, sans-serif',
                              margin: '2px 0 0',
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            }}>
                              {n.body}
                            </p>
                          )}
                        </div>
                        {!n.read_at && (
                          <div style={{
                            flexShrink: 0, alignSelf: 'center',
                            width: 8, height: 8, borderRadius: '50%',
                            background: C.gold,
                          }} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
