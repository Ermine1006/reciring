import { useEffect, useRef, useState } from 'react'
import PeerAvatar from './PeerAvatar'
import { fetchChatProfile } from '../lib/askMutuSharedProfiles'
import { labelForTopic, labelForIndustry, labelForInterest, labelForActivity, labelForHelping, PROGRAMS, CAREER_STAGES } from '../data/profileTaxonomy'
import './PeerProfileCard.css'

const labelled = (values, label = value => value) => Array.isArray(values) ? values.filter(v => typeof v === 'string').map(v => v.startsWith('custom:') ? v.slice(7) : label(v)) : []

export default function PeerProfileCard({ open, onClose, match, currentUserId, onRequestReveal }) {
  const dialog = useRef(null)
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  const scope = `${currentUserId}:${match?.id}:${match?.reveal?.status}:${match?.status}:${match?.peerProfilePublic}:${retry}`
  const current = result?.scope === scope ? result : null
  useEffect(() => {
    if (!open) return
    const target = dialog.current
    const previous = document.activeElement
    if (target && !target.open) target.showModal ? target.showModal() : target.setAttribute('open', '')
    // Focus the drawer itself so touch openings do not highlight the close button.
    target?.focus({ preventScroll: true })
    return () => {
      if (target?.open) target.close ? target.close() : target.removeAttribute('open')
      previous?.focus?.({ preventScroll: true })
    }
  }, [open])
  useEffect(() => {
    if (!open) { setResult(null); return }
    let cancelled = false
    setResult(null)
    fetchChatProfile(match?.id, currentUserId).then(data => { if (!cancelled) setResult({ ...data, scope }) })
    return () => { cancelled = true }
  }, [open, scope]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null
  const p = current?.profile
  const shared = current?.access === 'shared'
  return <dialog ref={dialog} className="peer-full-profile" aria-label="Member profile" tabIndex={-1} onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === dialog.current) onClose() }}>
    <div className="peer-full-profile__layout">
      <header>
        <div><strong>Profile</strong><p>{p ? (shared ? 'Shared with you' : 'Public profile') : 'Member details'}</p></div>
        <button type="button" aria-label="Close profile" onClick={onClose}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </header>
      <div className="peer-full-profile__body">
        {!current ? <p role="status">Loading profile…</p> : current.error ? <div role="alert">
          <p>{current.error}</p>
          {current.code === 'profile_sharing_required' ? <>
            <p>A public name does not open a private profile. Both people can choose to share their profiles.</p>
            {onRequestReveal && <button type="button" className="peer-full-profile__action" onClick={async () => { await onRequestReveal(); onClose() }}>Request profile sharing</button>}
          </> : <button type="button" className="peer-full-profile__action" onClick={() => setRetry(n => n + 1)}>Try again</button>}
        </div> : p && <>
          <div className="peer-full-profile__hero">
            <PeerAvatar name={p.name || 'Member'} seed={p.avatar_url || match?.id} size={52} />
            <div className="peer-full-profile__identity">
            <h2>{p.name || 'Member'}</h2>
            {(p.professional_headline || p.headline) && <p className="peer-full-profile__headline">{p.professional_headline || p.headline}</p>}
            </div>
          </div>
          <section><h3>Background</h3><dl>
            {[['Program', PROGRAMS.find(x => x.id === p.program)?.label || p.program], ['Graduation year', p.graduation_year], ['Role', p.title], ['Company', p.company], ['Location', p.location], ['Career stage', CAREER_STAGES.find(x => x.id === p.career_stage)?.label || p.career_stage], ['School email', shared && p.email]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl></section>
          <Tags title="Industry experience" values={labelled(p.industries_known ?? p.industry_interests, labelForIndustry)} />
          <Tags title="Industries I’m exploring" values={labelled(p.industries_exploring, labelForIndustry)} />
          <Tags title="You can ask me about" values={labelled(p.expertise_offered, labelForTopic)} />
          <Tags title="I’d like help with" values={labelled(p.help_wanted, labelForTopic)} />
          <Tags title="Beyond work" values={labelled(p.personal_interests, labelForInterest)} />
          <Tags title="Activities I’m up for" values={labelled(p.activity_preferences, labelForActivity)} />
          <Tags title="Ways to connect" values={labelled(p.helping_preferences ?? p.can_help_with, labelForHelping)} />
          <Tags title="Looking to connect" values={labelled(p.networking_intent)} />
          <Tags title="Support I’m looking for" values={labelled(p.skills_to_learn)} />
          {[['Ask me about', p.prompt_ask_me], ['On weekends', p.prompt_weekend], ['I’d love to find people for', p.prompt_seeking]].filter(([, value]) => value).map(([label, value]) => <section key={label}><h3>{label}</h3><p className="peer-full-profile__prompt">{value}</p></section>)}
          <p className="peer-full-profile__note">Details this member has added to their profile.</p>
        </>}
      </div>
    </div>
  </dialog>
}
function Tags({ title, values }) {
  if (!values.length) return null
  return <section><h3>{title}</h3><div className="peer-full-profile__tags">{values.map((value, i) => <span key={`${value}:${i}`}>{value}</span>)}</div></section>
}
