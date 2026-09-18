import { describe, expect, it, vi } from 'vitest'
vi.mock('../supabase', () => ({ isSupabaseConfigured: false, supabase: {} }))
import { isPeerNamePublic } from '../matches'

const POSTER = 'macie', HELPER = 'serine'
const row = (post, source = 'post') => ({ source, post: { created_by: POSTER, ...post } })

describe('isPeerNamePublic', () => {
  it('names a poster whose card already showed their name', () => {
    expect(isPeerNamePublic(row({ is_anonymous: false }), POSTER, 'private')).toBe(true)
    expect(isPeerNamePublic(row({ is_anonymous: null }), POSTER, 'public')).toBe(true)
  })
  it('keeps an anonymous post anonymous even for a public profile', () => {
    expect(isPeerNamePublic(row({ is_anonymous: true }), POSTER, 'public')).toBe(false)
  })
  it('keeps an unflagged post from a private profile anonymous', () => {
    expect(isPeerNamePublic(row({ is_anonymous: null }), POSTER, 'private')).toBe(false)
  })
  it('names a helper only when their profile is public', () => {
    expect(isPeerNamePublic(row({ is_anonymous: false }), HELPER, 'public')).toBe(true)
    expect(isPeerNamePublic(row({ is_anonymous: false }), HELPER, 'private')).toBe(false)
  })
  it('leaves non-post connections to their own identity flows', () => {
    expect(isPeerNamePublic(row({ is_anonymous: false }, 'smart_match'), POSTER, 'public')).toBe(false)
    expect(isPeerNamePublic({ source: 'post', post: null }, POSTER, 'public')).toBe(false)
  })
})
