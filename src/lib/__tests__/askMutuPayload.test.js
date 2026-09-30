import { expect, it } from 'vitest'
import { serializeAssistantContext } from '../askMutuPayload'
it('preserves complete small contexts', () => {
  const context = { buddy: { programs: [{ name: 'Rotman' }] } }
  expect(JSON.parse(serializeAssistantContext(context))).toEqual(context)
})
it('keeps valid JSON and every source when a large record needs shortening', () => {
  const record = { name: 'Maya', note: 'Long encounter note '.repeat(100) }
  const context = {
    me: { name: 'Sara' }, people: Array.from({ length: 60 }, () => record),
    buddy: { programs: [{ name: 'Rotman' }], assigned_buddies: [{ buddy_name: 'Serine', status: 'confirmed' }] },
    my_stories: [{ title: 'My page', status: 'draft' }],
    strongest_relationships: [{ name: 'Maya', practices_together: 4 }],
  }
  const serialized = serializeAssistantContext(context)
  expect(serialized.length).toBeLessThanOrEqual(12000)
  const result = JSON.parse(serialized)
  expect(result.context_limited).toBe(true)
  expect(result.buddy).toEqual(context.buddy)
  expect(result.my_stories).toEqual(context.my_stories)
  expect(result.strongest_relationships).toEqual(context.strongest_relationships)
  expect(result.people.length).toBeGreaterThan(0)
})
