import { beforeEach, expect, it, vi } from 'vitest'
const { from, rpc, chain } = vi.hoisted(() => {
  const chain = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn(), order: vi.fn() }
  return { from: vi.fn(() => chain), rpc: vi.fn(), chain }
})
vi.mock('../supabase', () => ({ isSupabaseConfigured: true, supabase: { from, rpc } }))
import { updatePost, deletePost, fetchPosts, rowToCard } from '../posts'
import { createMatch } from '../matches'
beforeEach(() => {
  vi.clearAllMocks()
  for (const method of ['select','eq','update','delete','upsert']) chain[method].mockReturnValue(chain)
  rpc.mockResolvedValue({ data: null, error: null })
})
const mirror = { id: 'public', created_by: 'owner', buddy_post_id: 'buddy', need_text: 'Before', is_anonymous: true }
it('routes public edits through the canonical Buddy post and returns refreshed content', async () => {
  chain.single.mockResolvedValueOnce({ data: mirror }).mockResolvedValueOnce({ data: { ...mirror, need_text: 'After', is_anonymous: false } })
  const fields = { need_text: 'After', is_anonymous: false }
  const result = await updatePost('public', 'owner', fields)
  expect(rpc).toHaveBeenCalledWith('buddy_public_update', { p_post: 'public', p_fields: fields })
  expect(chain.update).not.toHaveBeenCalled()
  expect(result.data).toMatchObject({ needs: 'After', isAnonymous: false, buddyPostId: 'buddy' })
})
it('routes public removal through the canonical removal RPC and preserves server errors', async () => {
  chain.single.mockResolvedValue({ data: mirror })
  const error = new Error('Post not available.')
  rpc.mockResolvedValue({ error })
  expect((await deletePost('public','owner')).error).toBe(error)
  expect(rpc).toHaveBeenCalledWith('buddy_public_remove', { p_post: 'public' })
  expect(chain.delete).not.toHaveBeenCalled()
})
it('reuses the server-selected conversation for a public Buddy card', async () => {
  rpc.mockResolvedValue({ data: { id: 'existing-chat', identity_reveal_status: 'none' }, error: null })
  const result = await createMatch('helper', rowToCard(mirror))
  expect(rpc).toHaveBeenCalledWith('buddy_public_connect', { p_post: 'public' })
  expect(result.data).toMatchObject({ id: 'existing-chat', identity_reveal_status: 'none' })
  expect(chain.upsert).not.toHaveBeenCalled()
})
it('keeps archived mirrors out of Home, including for the author', async () => {
  chain.order.mockResolvedValue({ data: [mirror,{ ...mirror, id: 'hidden', buddy_visible: false },{ id: 'ordinary' }] })
  expect((await fetchPosts()).data.map(p => p.id)).toEqual(['public','ordinary'])
})
it('preserves ordinary post edit, removal and connection behavior', async () => {
  chain.single.mockResolvedValue({ data: { id: 'ordinary', need_text: 'Updated' } })
  await updatePost('ordinary','owner',{ need_text: 'Updated' })
  expect(chain.update).toHaveBeenCalled()
  await deletePost('ordinary','owner')
  expect(chain.delete).toHaveBeenCalled()
  await createMatch('helper',{ id: 'ordinary', created_by: 'owner' })
  expect(chain.upsert).toHaveBeenCalled()
  expect(rpc).not.toHaveBeenCalled()
})

const noRow = { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' }
it('explains a vanished post instead of showing the Postgres phrasing', async () => {
  chain.single.mockResolvedValueOnce({ data: null, error: noRow })
  const result = await updatePost('gone', 'owner', { need_text: 'After' })
  expect(result.data).toBe(null)
  expect(result.error.message).toMatch(/not available to edit/i)
  expect(result.error.message).not.toMatch(/coerce/i)
})
it('saves through the program route when a row rule refuses the ordinary edit', async () => {
  chain.single
    .mockResolvedValueOnce({ data: { id: 'ordinary', created_by: 'owner', need_text: 'Before' } })
    .mockResolvedValueOnce({ data: null, error: noRow })
    .mockResolvedValueOnce({ data: { id: 'ordinary', created_by: 'owner', need_text: 'After' } })
  const fields = { need_text: 'After' }
  const result = await updatePost('ordinary', 'owner', fields)
  expect(rpc).toHaveBeenCalledWith('buddy_public_update', { p_post: 'ordinary', p_fields: fields })
  expect(result.error).toBe(null)
})
it('says what happened when neither route can save the post', async () => {
  chain.single
    .mockResolvedValueOnce({ data: { id: 'ordinary', created_by: 'owner' } })
    .mockResolvedValueOnce({ data: null, error: noRow })
  rpc.mockResolvedValue({ error: new Error('Post not available.') })
  const result = await updatePost('ordinary', 'owner', { need_text: 'After' })
  expect(result.data).toBe(null)
  expect(result.error.message).toMatch(/could not save this post/i)
  expect(result.error.message).not.toMatch(/coerce/i)
})
