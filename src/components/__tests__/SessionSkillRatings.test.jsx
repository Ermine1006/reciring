// @vitest-environment jsdom
import React from 'react'
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import SessionSkillRatings from '../practice/SessionSkillRatings'
const api = vi.hoisted(() => ({ support: vi.fn(), fetch: vi.fn() }))
vi.mock('../../lib/practice', () => ({ fetchSkillRatingsSupport: api.support, fetchSessionSkillRatings: api.fetch }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('waits for verification and displays only feedback received by the current user', async () => {
 api.support.mockResolvedValue({ supported: true })
 api.fetch.mockResolvedValue({ data: [
  { recipient_user_id: 'me', ratings: { leadership: 4 } },
  { recipient_user_id: 'partner', ratings: { structuring: 2 } },
 ] })
 const { rerender } = render(<SessionSkillRatings session={{ id:'s', status:'confirmed', interview_category:'case' }} myUserId="me" />)
 expect(api.fetch).not.toHaveBeenCalled()
 rerender(<SessionSkillRatings session={{ id:'s', status:'verified', interview_category:'case' }} myUserId="me" />)
 expect(await screen.findByText('Leadership: 4/5')).toBeTruthy()
 expect(screen.queryByText('Structuring: 2/5')).toBeNull()
})
