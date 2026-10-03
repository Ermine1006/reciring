// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('../../lib/events', () => ({ fetchUpcomingEvents: async () => ({ data: [] }), fetchMyJoinedEventIds: async () => ({ data: new Set() }) }))
vi.mock('../../lib/eventMemory', () => ({ fetchFollowups: async () => ({ data: [] }), fetchEncounters: async () => ({ data: [] }), personKey: x => x }))
vi.mock('../../lib/relationships', () => ({ fetchConnections: async () => ({ data: [] }) }))
vi.mock('../../lib/marketplace', () => ({ fetchPastEventPostsToShare: async () => ({ data: [] }), dismissDiscoverSharePrompt: async () => ({}) }))
vi.mock('../../lib/featureFlags', () => ({ isHomeGraphEnabled: () => false }))
vi.mock('../CommunityNetworkGraph', () => ({ default: () => null }))
vi.mock('../SmartMatchSection', () => ({ default: () => null }))
import HomePage from '../HomePage'

const post = (id, name, needs) => ({
  id, created_by: `author-${id}`, needs, offers: null, isAnonymous: false,
  creator: { name, visibility: 'public' }, tags: [], helpType: [], industry: [],
})
const posts = [post('a', 'Thomas', 'Mock interview practice for Consulting'), post('b', 'Macie', 'Coffee chat in design')]
const viewer = { strengths: [], industries: [] }

afterEach(cleanup)

it('shows a recommendation the viewer has not passed on', () => {
  render(<HomePage profile={{ name: 'Sara' }} viewerProfile={viewer} userId="me" requests={posts} />)
  expect(screen.getByText(/Thomas|Macie/)).toBeTruthy()
})

it('moves to the next person once the viewer says Not for me', () => {
  const { rerender } = render(<HomePage profile={{ name: 'Sara' }} viewerProfile={viewer} userId="me" requests={posts} />)
  const first = screen.getByText(/Thomas|Macie/).textContent
  const passed = new Set([posts.find(p => p.creator.name === first.trim())?.id].filter(Boolean))
  expect(passed.size).toBe(1)
  rerender(<HomePage profile={{ name: 'Sara' }} viewerProfile={viewer} userId="me" requests={posts} passedPostIds={passed} />)
  const second = screen.getByText(/Thomas|Macie/).textContent
  expect(second.trim()).not.toBe(first.trim())
})

it('stops offering anyone once every recommendation is passed', () => {
  const passed = new Set(posts.map(p => p.id))
  render(<HomePage profile={{ name: 'Sara' }} viewerProfile={viewer} userId="me" requests={posts} passedPostIds={passed} />)
  expect(screen.queryByText(/Thomas|Macie/)).toBe(null)
})
