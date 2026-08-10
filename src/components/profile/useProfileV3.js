import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { rowToDraft, draftToPatch, computeBackfill, needsV3Backfill } from '../../lib/profileV3'

// Load / autosave / one-time-backfill for the redesigned Profile.
// `enabled` MUST be the feature-flag result: when false the hook is inert so a
// non-flagged user's legacy row is never migrated or written.
export function useProfileV3(enabled = true) {
  const { profile, user, updateProfile } = useAuth()
  const [draft, setDraft] = useState(() => rowToDraft(profile || {}))
  const timer = useRef(null)
  const didBackfill = useRef(false)
  const didInit = useRef(false)

  useEffect(() => {
    if (!enabled || !profile) return
    if (needsV3Backfill(profile) && !didBackfill.current) {
      didBackfill.current = true
      const { patch, log } = computeBackfill(profile, new Date().toISOString())
      updateProfile(patch).then(({ data }) => { if (data) setDraft(rowToDraft(data)) })
      if (log.length && user?.id) {
        supabase.from('profile_migration_log')
          .insert(log.map(l => ({ ...l, user_id: user.id })))
          .then(() => {}, () => {}) // best-effort audit; never block the UI
      }
    } else if (!didInit.current) {
      didInit.current = true
      setDraft(rowToDraft(profile))
    }
  }, [enabled, profile, user, updateProfile])

  // Debounced autosave of the whole draft.
  const onChange = useCallback((next) => {
    setDraft(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { updateProfile(draftToPatch(next)) }, 600)
  }, [updateProfile])

  // Flush immediately (+ optional extra columns like onboarding_done).
  const saveNow = useCallback(async (extra = {}) => {
    clearTimeout(timer.current)
    return updateProfile({ ...draftToPatch(draft), ...extra })
  }, [draft, updateProfile])

  return { draft, onChange, saveNow, profile }
}
