import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { normalizeLinkedInClaims } from '../../lib/profile/linkedinClaims'
import { buildImportReview, applyImport } from '../../lib/profile/profileDraft'

// Orchestrates the LinkedIn-assisted profile flow for the Edit screen.
//   • connect()  → kicks off linkIdentity (browser redirects to LinkedIn)
//   • on return to ?linked=linkedin → pulls the identity, normalizes claims,
//     builds the review rows, and moves to `reviewing`
//   • apply(choices, values) → the patch to persist (never overwrites existing
//     non-empty values unless the user turned that field on)
//
// `enabled` must be the feature-flag result; inert otherwise.
export function useLinkedInProfileLink(enabled, existingRow) {
  const { linkLinkedInIdentity, getLinkedInIdentity } = useAuth()
  const [status, setStatus] = useState('idle') // idle | connecting | loading | reviewing | error
  const [claims, setClaims] = useState(null)
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)
  const handled = useRef(false)

  // Detect the OAuth return marker once, then fetch the linked identity.
  useEffect(() => {
    if (!enabled || handled.current || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('linked') !== 'linkedin') return
    handled.current = true
    url.searchParams.delete('linked')
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)

    setStatus('loading')
    getLinkedInIdentity().then(identity => {
      if (!identity) {
        setStatus('error')
        setError('LinkedIn didn’t share any details this time. You can complete your profile below.')
        return
      }
      const c = normalizeLinkedInClaims(identity.identity_data)
      setClaims(c)
      setRows(buildImportReview(existingRow || {}, c))
      setStatus('reviewing')
    })
  }, [enabled, existingRow, getLinkedInIdentity])

  const connect = useCallback(async () => {
    setError(null)
    setStatus('connecting')
    const { error } = await linkLinkedInIdentity()
    // On success the browser navigates to LinkedIn; only an error returns here.
    if (error) { setStatus('error'); setError(friendly(error)) }
  }, [linkLinkedInIdentity])

  const apply = useCallback((choices, values) => applyImport(rows, choices, values), [rows])
  const reset = useCallback(() => { setStatus('idle'); setClaims(null); setRows([]); setError(null) }, [])

  return { status, claims, rows, error, connect, apply, reset }
}

function friendly(e) {
  const m = (e?.message || '').toLowerCase()
  if (m.includes('provider') || m.includes('not enabled') || m.includes('unsupported')) {
    return 'LinkedIn sign-in isn’t switched on yet. You can complete your profile manually for now.'
  }
  if (m.includes('already')) return 'That LinkedIn account is already linked to another Mutu profile.'
  return 'Couldn’t connect to LinkedIn. Please try again, or continue manually.'
}
