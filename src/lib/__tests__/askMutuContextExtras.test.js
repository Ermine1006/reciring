import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ buddy: vi.fn(), stories: vi.fn(), community: vi.fn(), edges: vi.fn(), profiles: vi.fn() }))
vi.mock('../buddy/api', () => ({ buddyRpc: api.buddy }))
vi.mock('../stories', () => ({ fetchStories: api.stories }))
vi.mock('../practice', () => ({ fetchCommunityBySlug: api.community, fetchMyPracticeEdges: api.edges, fetchProfilesByIds: api.profiles }))
vi.mock('../supabase', () => ({ supabase: {}, isSupabaseConfigured: true }))
import { loadAskMutuContextExtras } from '../askMutuContextExtras'
import { buildAssistantContext, askMutu } from '../eventMemory'

beforeEach(() => {
  vi.clearAllMocks()
  api.community.mockResolvedValue({ data: { id: 'rotman' } })
  api.buddy.mockImplementation(async (name, args) => {
    if (name === 'buddy_assigned_state') return { pairs: [
      { status: 'confirmed', name: 'Serine', email: 'private@example.com', requests: [{ body: 'Private conversation' }] },
      { status: 'pending', name: 'Hidden mentor', email: 'hidden@example.com' },
    ] }
    if (!args) return { programs: [{ id: 'p', name: 'Rotman' }] }
    return { role: 'first', posts: [
      { owner: 'me', needs: 'Recruiting advice', offers: 'Resume help', audiences: ['assigned_buddy','buddy_program'], is_anonymous: true },
      { owner: null, needs: 'Another student secret' },
    ], invitations: [{ status: 'pending', name: 'Hidden helper' }, { status: 'accepted', name: 'Maya' }] }
  })
  api.stories.mockResolvedValue({ data: { items: [
    { is_mine: true, title: 'My career change', topic: 'career', status: 'draft', body: 'Secret writing' },
    { is_mine: false, title: 'Someone else story', body: 'Not mine' },
  ] } })
  api.edges.mockResolvedValue({ data: [
    { user_lo: 'me', user_hi: 'peer', verified_exchange_count: 4, last_verified_at: '2026-09-20T00:00:00Z' },
    { user_lo: 'other', user_hi: 'stranger', verified_exchange_count: 20 },
  ] })
  api.profiles.mockResolvedValue({ data: { peer: { name: 'Maya' }, other: { name: 'Not my relationship' } } })
})

it('sends the real RPC shapes through builders and into the AI request without private content', async () => {
  const extras = await loadAskMutuContextExtras('me')
  const context = buildAssistantContext(extras)
  expect(context.buddy.my_posts[0].audiences).toEqual(['assigned_buddy','buddy_program'])
  expect(context.buddy.assigned_buddies.map(p => p.buddy_name)).toEqual(['Serine',null])
  expect(context.buddy.help_offers.map(p => p.peer_name)).toEqual([null,'Maya'])
  expect(context.my_stories).toEqual([{ title: 'My career change', topic: 'career', status: 'draft', last_worked_on: null }])
  expect(context.strongest_relationships[0]).toMatchObject({ name: 'Maya', practices_together: 4, shared_tokens: 4 })
  expect(api.profiles).toHaveBeenCalledWith(['peer'])
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ answer: 'Your record is ready.' }) })
  try {
    await askMutu('What should I follow up on?', context)
    const sent = JSON.parse(fetch.mock.calls[0][1].body).context
    expect(sent).toEqual(context)
    for (const hidden of ['private@example.com','Private conversation','Hidden mentor','Hidden helper','Another student secret','Secret writing','Someone else story','Not my relationship']) {
      expect(JSON.stringify(sent)).not.toContain(hidden)
    }
  } finally { fetch.mockRestore() }
})

it('keeps Buddy and relationship context when the Story RPC returns an error', async () => {
  api.stories.mockResolvedValue({ data: null, error: { message: 'Migration unavailable' } })
  const context = buildAssistantContext(await loadAskMutuContextExtras('me'))
  expect(context.my_stories).toBeUndefined()
  expect(context.buddy.programs).toHaveLength(1)
  expect(context.strongest_relationships).toHaveLength(1)
  expect(context.unavailable_context).toEqual(['my_stories'])
})

it('keeps stories and relationships when Buddy access fails', async () => {
  api.buddy.mockRejectedValue(new Error('Buddy unavailable'))
  const context = buildAssistantContext(await loadAskMutuContextExtras('me'))
  expect(context.buddy).toBeUndefined()
  expect(context.my_stories).toHaveLength(1)
  expect(context.strongest_relationships).toHaveLength(1)
  expect(context.unavailable_context).toEqual(['buddy'])
})

it('does not query private sources without a signed-in member', async () => {
  expect(await loadAskMutuContextExtras(null)).toEqual({ buddy: null, stories: null, circle: null })
  for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled()
})
