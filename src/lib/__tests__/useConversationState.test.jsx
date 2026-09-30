// @vitest-environment jsdom
import { act, renderHook, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import useConversationState from '../useConversationState'
afterEach(cleanup)
it('clears messages immediately on a peer switch and ignores late sends, fetches and receipts', () => {
  const { result, rerender } = renderHook(({ id }) => useConversationState(id, []), { initialProps: { id: 'a' } })
  const updateA = result.current[1]
  act(() => updateA(['Private message A']))
  rerender({ id: 'b' })
  expect(result.current[0]).toEqual([])
  act(() => result.current[1](['Private message B']))
  act(() => updateA(previous => [...previous, 'Late message A']))
  expect(result.current[0]).toEqual(['Private message B'])
  rerender({ id: 'a' })
  act(() => updateA(['Stale fetch from first visit']))
  expect(result.current[0]).toEqual([])
})
it('does not carry a revealed peer profile into a different conversation', () => {
  const { result, rerender } = renderHook(({ id }) => useConversationState(id, null), { initialProps: { id: 'a' } })
  const updateA = result.current[1]
  act(() => updateA({ name: 'Accepted peer' }))
  rerender({ id: 'b' })
  expect(result.current[0]).toBeNull()
  act(() => updateA({ name: 'Late profile' }))
  expect(result.current[0]).toBeNull()
})
