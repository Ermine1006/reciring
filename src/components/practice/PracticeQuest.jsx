import { useState } from 'react'
import { Sprout, Flag, Users, Repeat2, MessageCircle, Leaf, LockKeyhole, ChevronDown, ArrowRight, LogOut, Mail } from 'lucide-react'
import { matchaCta } from '../../lib/matchaCta'
import QuickSetupCard from './QuickSetupCard'
import PracticeGarden from './PracticeGarden'
import InvitationsList from './InvitationsList'
import PeerAvatar from '../PeerAvatar'
import { PRACTICE_TYPE_SHORT } from '../../data/practiceOptions'
import './practiceQuest.css'

const steps = [
  { title: 'Pick a quest', sub: 'Choose your practice', icon: Flag },
  { title: 'Find your teammate', sub: 'A useful fit for both of you', icon: Users },
  { title: 'Take turns', sub: 'One round each', icon: Repeat2 },
  { title: 'Share a tip', sub: 'Private feedback, a next step', icon: MessageCircle },
  { title: 'Grow together', sub: 'Both confirm. One shared token.', icon: Leaf },
]

export default function PracticeQuest({ request, windowsStale, rows, pairings, names, passport, saving, busyId,
  recommendationSettings = null, preferenceValue, recommendationKey, avatarSeed, browseError = false, browseLoading = false, onRetry, onPublish, onPreferences, onTimes, onLeave, onInvite, onAccept, onDecline, onWithdraw, onChat, onPractice, onProgress, onSessions }) {
  const pending = pairings.filter(p => p.status === 'invited')
  const accepted = pairings.filter(p => p.status === 'accepted')
  const [step, setStep] = useState(null)
  const current = step ?? (!request ? 0 : 1)
  const [showDemo, setShowDemo] = useState(false)
  const openPractice = p => onPractice(p.id)
  const partners = (feedback = false) => accepted.length ? accepted.map(p => {
    const name = names[p.counterpart_user_id] || 'Your teammate'
    return <section className="quest-paper" key={p.id}>
      <div className="quest-row"><PeerAvatar name={name} seed={p.counterpart_user_id || p.id} size={48} /><div><h3>{name}</h3><p>Both accepted · Ready to connect</p></div></div>
      <div className="quest-actions">
        {p.match_id && <button className="quest-primary" onClick={() => onChat(p.match_id)}>Open Messages ↗</button>}
        <button className="quest-secondary" onClick={() => openPractice(p)}>{feedback ? 'Confirm & give feedback' : 'Continue practice →'}</button>
      </div>
    </section>
  }) : <section className="quest-paper"><h3>Find a teammate first</h3><p>Accept an invitation together to begin.</p><button className="quest-primary" onClick={() => setStep(1)}>Meet your teammate →</button></section>
  return <div className="practice-quest">
    <div className="quest-row quest-stats"><span><Sprout size={16} /> {passport.verified || 0} completed</span><button className="quest-link" onClick={onProgress}>My progress</button></div>
    {request && (recommendationSettings || <section className="quest-paper">
      <h3>Personalise my practice</h3><p>Practice types and available times</p>
      <button type="button" className="quest-secondary" onClick={onPreferences}>Edit preferences</button>
      <p>Skill preferences could not be loaded.</p><button type="button" className="quest-link" onClick={onRetry}>Retry skill preferences</button>
    </section>)}
    {windowsStale && <section className="quest-availability-notice" role="status"><div><strong>Your available times have passed</strong><p>You can still match. Add fresh times when you’re ready.</p></div><button type="button" className="quest-secondary" onClick={onTimes}>Update times</button></section>}
    {pending.some(p => p.i_invited === false) && current !== 1 && <section className="quest-paper" role="status">
      <h3>You have a practice invitation</h3><button className="quest-primary" onClick={() => setStep(1)}>Review invitation</button>
    </section>}
    <div className="quest-shortcuts">
    {accepted.length > 0 && current === 1 && <button type="button" className="quest-continue" style={matchaCta} onClick={onSessions || (() => setStep(2))}><Users size={18} aria-hidden="true" /> Continue practice <ArrowRight size={16} aria-hidden="true" /></button>}
    <details className="quest-journey"><summary><Flag size={17} aria-hidden="true" /> Practice steps <ChevronDown className="quest-disclosure-chevron" size={16} aria-hidden="true" /></summary>
    <div className="quest-map" aria-label="Your practice quest">
      {steps.map(({ title, sub, icon: Icon }, i) => <button key={title} type="button" className={`quest-node ${current === i ? 'is-current' : ''}`} onClick={() => setStep(i)} aria-current={current === i ? 'step' : undefined}>
        <span className="quest-node-icon"><Icon size={22} /></span><span><strong>{title}</strong>{current === i && <small>{sub}</small>}</span><span className="quest-node-num">{i + 1}</span>
      </button>)}
    </div>
    </details>
    </div>
    <div className="quest-content" key={current}>
      {current === 0 && (!request ? <QuickSetupCard saving={saving} onPublish={onPublish} preferenceValue={preferenceValue} /> : <section className="quest-paper">
        <h2>Your quest</h2><div className="quest-chips">{(request.want_types || []).map(t => <span key={t}>{PRACTICE_TYPE_SHORT[t] || t}</span>)}<span>{request.duration_minutes} min</span></div>
        <button className="quest-primary" onClick={() => setStep(1)}>Find my teammate →</button>
        <button className="quest-link" onClick={onPreferences}>Change preferences</button>
      </section>)}
      {current === 1 && <>
        <h2>Meet your teammate</h2>
        <InvitationsList pairings={pairings} busyId={busyId} only="incoming" onAccept={onAccept} onDecline={onDecline} onWithdraw={onWithdraw} />
        {!request ? <section className="quest-paper"><p>Choose what you want to practise.</p><button className="quest-primary" onClick={() => setStep(0)}>Pick a quest →</button></section> : <>
          <p className="quest-private"><LockKeyhole size={14} /> Names unlock when you both accept.</p>
          {rows.length > 0 && !browseError && <div className="quest-recommendation-heading"><h3>{rows.some(r => r.recommendation) ? 'Recommended for you' : 'Matches for your practice types'}</h3><p>{rows.some(r => r.recommendation) ? 'Matched to your focus and shared strengths.' : 'Skill and response recommendations are not connected yet.'}</p></div>}
          {browseLoading && rows.length > 0 && <p role="status">Refreshing teammates…</p>}
          {browseLoading && !rows.length ? <p role="status">Looking for teammates…</p> : browseError ? <section className="quest-paper"><h3>Couldn’t load teammates</h3><p>Your preferences are saved. Please try again.</p><button className="quest-primary" onClick={onRetry}>Try again</button></section> : rows.length ? <PracticeGarden rows={rows} request={request} busyId={busyId} onInvite={onInvite} onPreferences={onPreferences} resetKey={recommendationKey} avatarSeed={avatarSeed} /> : <section className="quest-paper"><h3>{accepted.length ? 'Your teammate is already matched' : pending.length ? 'Your invitations are in progress' : 'No new practice matches right now'}</h3>
            <p>{accepted.length ? 'Open your existing partnership to chat or practise.' : pending.length ? 'Invited people are listed in your invitations below.' : 'No new requests currently match what you want to practise and can help with. Times are optional.'}</p>
            <button className="quest-primary" onClick={accepted.length ? () => setStep(2) : onPreferences}>{accepted.length ? 'Open my teammates' : 'Review practice types'}</button>
            <button className="quest-link" onClick={onRetry}>Refresh teammates</button></section>}
          <div className="quest-pool-actions">
            {pending.some(p => p.i_invited) && <details className="quest-invitations"><summary><Mail size={17} aria-hidden="true" /> Sent invitations <span className="quest-action-count">{pending.filter(p => p.i_invited).length}</span><ChevronDown className="quest-disclosure-chevron" size={16} aria-hidden="true" /></summary><InvitationsList pairings={pairings} busyId={busyId} only="outgoing" onAccept={onAccept} onDecline={onDecline} onWithdraw={onWithdraw} /></details>}
            <button type="button" className="quest-exit" onClick={onLeave}><LogOut size={16} aria-hidden="true" /> Leave the pool</button>
          </div>
        </>}
        <details className="quest-paper" onToggle={event => setShowDemo(event.currentTarget.open)}>
          <summary>Demo profiles · Sample data</summary>
          <p>Fictional teammates for presentations. No real invitations are sent.</p>
          <a href="/practice-demo.html" target="_blank" rel="noopener noreferrer" className="quest-link">Open presentation view ↗</a>
          {showDemo && <iframe title="Mutu practice demo profiles" src="/practice-demo.html" sandbox="allow-scripts" loading="lazy" style={{ width: '100%', height: 720, border: 0, borderRadius: 20, display: 'block', marginTop: 12 }} />}
        </details>
      </>}
      {current === 2 && <><h2>One round each</h2><p>Plan in Messages. Return here to practise.</p>{partners()}</>}
      {current === 3 && <><h2>One useful next step</h2><p className="quest-private"><LockKeyhole size={14} /> Feedback stays between you and your partner.</p>{partners(true)}<button className="quest-link" onClick={onProgress}>Read my feedback</button></>}
      {current === 4 && <section className="quest-paper"><Leaf size={32} /><h2>Grow together</h2><p>{passport.verified || 0} verified sessions · {passport.partners || 0} teammates</p><p>Tokens are earned when both people confirm.</p><button className="quest-primary" onClick={onProgress}>View my growth →</button><button className="quest-link" onClick={() => setStep(1)}>Find my next teammate</button></section>}
    </div>
  </div>
}
