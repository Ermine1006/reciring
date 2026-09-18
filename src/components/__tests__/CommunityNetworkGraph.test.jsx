// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import CommunityNetworkGraph from '../CommunityNetworkGraph'

vi.mock('../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {} }))
vi.mock('../../lib/registrationCount', () => ({ fetchRegistrationCount: vi.fn().mockResolvedValue(120) }))
vi.mock('../../lib/matches', () => ({ fetchMyMatches: vi.fn().mockResolvedValue({ data: [] }) }))
vi.mock('../../lib/recognition', () => ({ fetchBothConfirmedMatchIds: vi.fn().mockResolvedValue({ data: new Set() }) }))
vi.mock('../../lib/eventMemory', () => ({ fetchEncounters: vi.fn().mockResolvedValue({ data: [] }) }))
vi.mock('../../lib/practice', () => ({
  fetchCommunityBySlug: vi.fn().mockResolvedValue({ data: { id: 'c1', slug: 'rotman', name: 'Rotman' } }),
  // a member the map RPC does not admit (e.g. not an active community member)
  fetchCommunityMapSummary: vi.fn().mockResolvedValue({ data: null, error: { message: 'not_eligible' }, errorKind: 'denied' }),
  fetchMyRelationshipGraph: vi.fn().mockResolvedValue({ data: { edges: [] }, error: null, errorKind: null }),
  fetchMyPairings: vi.fn().mockResolvedValue({ data: [] }),
  fetchMyPracticeEdges: vi.fn().mockResolvedValue({ data: [] }),
  fetchProfilesByIds: vi.fn().mockResolvedValue({ data: {} }),
}))

globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} }

afterEach(cleanup)

it('shows a calm message instead of crashing when the Community Map cannot load', async () => {
  render(<CommunityNetworkGraph userId="u1" userName="Macie" />)
  const mapTab = await screen.findByRole('tab', { name: 'Community Map' })
  fireEvent.click(mapTab)
  expect(await screen.findByText(/Community Map/, { selector: 'p' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy()
})
