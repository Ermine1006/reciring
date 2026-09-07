import { beforeEach, describe, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../supabase', () => ({ supabase: { rpc }, isSupabaseConfigured: true }))
import { fetchStories, saveStory, saveStoryReply, reportStory, muteStoryWriter } from '../stories'
import { newStoryDraft } from '../../data/storiesContent'
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: {}, error: null }) })

describe('Story RPC boundary', () => {
  it('creates UUIDs on supported WebViews without crypto.randomUUID', () => {
    const webCrypto = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: webCrypto.getRandomValues.bind(webCrypto) })
    try {
      const first = newStoryDraft(), second = newStoryDraft()
      expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(first.id).not.toBe(second.id)
    } finally { vi.unstubAllGlobals() }
  })
  it('sends exact authored fields only, never spoofed author data', async () => {
    const draft = { ...newStoryDraft(), body: '  My words.\nUnpolished.  ', author_id: 'forged', user_id: 'forged', author_name: 'forged' }
    await saveStory({ communityId: 'community', draft, publish: true, pledge: true })
    expect(rpc.mock.calls[0]).toEqual(['story_save', {
      p_id: draft.id, p_community_id: 'community', p_title: '', p_body: draft.body,
      p_topic: 'becoming', p_identity_mode: 'anonymous', p_response_mode: 'sharing',
      p_expected_version: 0, p_publish: true, p_pledge: true,
    }])
  })
  it('does not submit empty publication or missing own words agreement', async () => {
    const draft = newStoryDraft()
    expect((await saveStory({ communityId: 'c', draft, publish: true, pledge: true })).error.code).toBe('CLIENT_INPUT')
    expect((await saveStory({ communityId: 'c', draft: { ...draft, body: 'Words' }, publish: true })).error.code).toBe('CLIENT_INPUT')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('uses target IDs for care controls and includes the reply pledge', async () => {
    await reportStory({ storyId: 's', replyId: 'r', reason: 'privacy' })
    await muteStoryWriter('s', 'r')
    await saveStoryReply('s', { id: 'r', body: '  Reply  ', identity_mode: 'anonymous', version: 2, pledge: true })
    expect(rpc.mock.calls).toEqual([
      ['story_report', { p_story_id: 's', p_reply_id: 'r', p_reason: 'privacy', p_details: '' }],
      ['story_mute_writer', { p_story_id: 's', p_reply_id: 'r' }],
      ['story_save_reply', { p_story_id: 's', p_id: 'r', p_body: '  Reply  ', p_identity_mode: 'anonymous', p_expected_version: 2, p_pledge: true }],
    ])
  })
  it('returns a failed save on thrown network errors with no local fallback', async () => {
    rpc.mockRejectedValue(Error('Offline'))
    const result = await saveStory({ communityId: 'c', draft: { ...newStoryDraft(), body: 'Words' } })
    expect(result.data).toBeNull(); expect(result.error.code).toBe('NETWORK')
    await fetchStories({ communityId: 'c' })
    expect(rpc).toHaveBeenLastCalledWith('story_list', expect.objectContaining({ p_view: 'garden', p_limit: 4, p_before: null }))
  })
})
