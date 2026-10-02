import { afterEach, expect, it, vi } from 'vitest'
import handler from '../../../api/ai-rewrite'
import { rewriteText } from '../aiRewrite'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })
const response = (content) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) })
it.each([
  [{ kind: 'post' }, 'Could someone help me prepare for an interview?', 'text'],
  [{ kind: 'post_offer' }, 'Happy to share what I learned working in VC.', 'text'],
  [{ kind: 'event_need' }, 'Looking for advice on interviews.', 'text'],
  [{ kind: 'event_offer' }, 'Happy to share my VC experience.', 'text'],
  [{ mode: 'capture' }, '{"person":"Thomas","next_action":"Send a note"}', 'capture'],
  [{ mode: 'profile_tags' }, '{"canHelpWith":["Advice"],"skillsToLearn":[],"industries":[]}', 'tags'],
  [{ mode: 'prompt_write' }, 'Weekend yoga with friends', 'text'],
  [{ mode: 'assistant' }, 'You can ask for a short practice session.', 'answer'],
])('calls the model and returns the expected result for %j', async (mode, content, key) => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-only')
  const fetchMock = vi.fn(async () => response(content))
  vi.stubGlobal('fetch', fetchMock)
  const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() }
  await handler({ method: 'POST', body: { ...mode, text: 'I am happy to share my VC experience', maxChars: 200 } }, res)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json.mock.calls[0][0][key]).toBeTruthy()
  const { messages } = JSON.parse(fetchMock.mock.calls[0][1].body)
  if (mode.mode !== 'assistant') expect(messages[0].content).not.toContain('Final response checks:')
})
it.each([{}, { text: '' }, { text: 123 }])('rejects an empty or malformed successful response: %j', async data => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => data })))
  const result = await rewriteText({ text: 'Original' })
  expect(result.text).toBeNull()
  expect(result.error).toBeInstanceOf(Error)
})
it('returns provider failures without replacing the draft', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Try again.' }) })))
  const result = await rewriteText({ text: 'Original' })
  expect(result.text).toBeNull()
  expect(result.error.message).toBe('Try again.')
})
it('ends a stalled rewrite so the user can retry', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Aborted')))
  })))
  const pending = rewriteText({ text: 'Original' })
  await vi.advanceTimersByTimeAsync(45000)
  expect((await pending).error).toBeInstanceOf(Error)
  expect(vi.getTimerCount()).toBe(0)
})
