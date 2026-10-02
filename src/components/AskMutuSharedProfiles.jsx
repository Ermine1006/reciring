import { useState } from 'react'

const button = { border: '1px solid #E8D9A7', borderRadius: 12, background: '#fff', padding: '9px 12px', color: '#49603B', cursor: 'pointer' }
const fields = [
  ['headline', 'About'], ['program', 'Program'], ['title', 'Role'], ['company', 'Company'],
  ['industries_known', 'Industry experience'], ['interests', 'Exploring'],
  ['expertise_offered', 'Can help with'], ['help_wanted', 'Would like help with'],
  ['helping_preferences', 'Ways to connect'], ['activity_preferences', 'Activities'],
  ['prompt_ask_me', 'Ask me about'], ['prompt_weekend', 'On weekends'], ['prompt_seeking', 'Looking for'],
]

export default function AskMutuSharedProfiles({ profiles, loading, error, onRefresh, onBack }) {
  const [search, setSearch] = useState('')
  const filtered = profiles.filter(row => `${row.name} ${row.profile?.program || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <section aria-label="Shared profiles" style={{ color: '#30372C', fontSize: 14, lineHeight: 1.6 }}>
    <button type="button" style={button} onClick={onBack}>‹ Back to Ask Mutu</button>
    <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20 }}>Profiles shared with you</h2>
    <p>People whose profile sharing is confirmed. Ask Mutu can use these details when relevant.</p>
    <button type="button" style={button} disabled={loading} onClick={onRefresh}>Refresh profiles</button>
    {loading ? <p role="status">Checking shared profiles…</p> : error ? <p role="alert">Shared profiles could not load. Please refresh to try again.</p> : <>
      {!profiles.length ? <p>No shared profiles are available. Open a conversation in Matches and use the profile sharing option. Both people need to accept.</p> : <>
        <label style={{ display: 'block', margin: '16px 0' }}>Find a shared profile
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #E8D9A7', borderRadius: 10 }} />
        </label>
        {!filtered.length && <p>No shared profiles match your search.</p>}
        {filtered.map(row => <details key={row.peerId} style={{ background: '#fff', border: '1px solid #E8D9A7', borderRadius: 14, margin: '12px 0', padding: '12px 14px' }}>
          <summary style={{ cursor: 'pointer', color: '#49603B', fontWeight: 650 }}>{row.name}{row.profile?.program ? ` · ${row.profile.program}` : ''}</summary>
          <dl style={{ marginBottom: 0, overflowWrap: 'anywhere' }}>
            <dt style={{ fontWeight: 650, marginTop: 12 }}>Personal interests</dt>
            <dd style={{ margin: '2px 0 10px' }}>{row.profile?.personal_interests?.join(', ') || 'Not added to this profile.'}</dd>
            {fields.map(([key, label]) => {
              const value = Array.isArray(row.profile?.[key]) ? row.profile[key].join(', ') : row.profile?.[key]
              return value ? <div key={key}><dt style={{ fontWeight: 650, marginTop: 12 }}>{label}</dt><dd style={{ margin: '2px 0 10px', whiteSpace: 'pre-wrap' }}>{value}</dd></div> : null
            })}
          </dl>
        </details>)}
      </>}
    </>}
  </section>
}
