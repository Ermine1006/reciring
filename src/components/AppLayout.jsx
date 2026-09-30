import { Sparkles, MessageCircle } from 'lucide-react'
import { MATCHA_DEEP, MATCHA_SOFT } from '../lib/matchaCta'

// One DOM tree across screen sizes keeps navigation and drafts in sync.
export function AppFrame({ children }) {
  return (
    <div className="mutu-viewport">
      <a href="#mutu-main" className="mutu-skip-link">Skip to content</a>
      <div className="mutu-shell relative flex flex-col">{children}</div>
    </div>
  )
}

export function AppNavigation({ tabs, activeTab, onNavigate, postIsDiscover = false, onAskMutu }) {
  return (
    <nav className="mutu-navigation" aria-label="Main navigation">
      <div className="mutu-nav-links">
        {tabs.map(t => {
          const active = activeTab === t.id || (postIsDiscover && activeTab === 'post' && t.id === 'discover')
          return <button key={t.id} type="button" data-mutu-glass=""
            aria-current={active ? 'page' : undefined}
            onClick={() => onNavigate(t.id)} className="mutu-nav-item"
            style={{ color: active ? MATCHA_DEEP : '#6E6A61', background: active ? MATCHA_SOFT : 'transparent' }}>
            {t.icon(active)}<span>{t.label}</span>
          </button>
        })}
      </div>
      <button type="button" className="mutu-nav-assistant" onClick={onAskMutu}>
        <Sparkles size={20} aria-hidden="true" /><span>Ask Mutu</span>
      </button>
    </nav>
  )
}

export function MessagesWorkspace({ list, hasSelection, children }) {
  return (
    <div className="mutu-messages-workspace" data-selected={hasSelection ? 'true' : 'false'}>
      <div className="mutu-messages-list">{list}</div>
      <div className="mutu-messages-detail">
        {hasSelection ? children : <div className="mutu-messages-placeholder">
          <MessageCircle size={32} strokeWidth={1.4} aria-hidden="true" />
          <h2>Your conversations</h2>
          <p>Choose a conversation to read, reply or plan a time together.</p>
        </div>}
      </div>
    </div>
  )
}
