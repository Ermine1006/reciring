// @vitest-environment jsdom
import React from 'react'
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import SessionConfirmCard from '../practice/SessionConfirmCard'
import PeerStrengthSharing from '../practice/PeerStrengthSharing'
const api = vi.hoisted(() => ({ feedback: vi.fn(), strengths: vi.fn(), teammate: vi.fn().mockResolvedValue({ supported: true }), share: vi.fn() }))
vi.mock('../../lib/practice', () => ({ fetchFeedbackSupport: api.feedback, fetchPeerStrengthSupport: api.strengths, fetchTeammateFeedbackSupport: api.teammate, peerStrengthSharing: api.share }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('offers strengths in the chat completion path, allows deselection, and submits them with confirmation', async () => {
 api.teammate.mockResolvedValue({ supported: true }); api.feedback.mockResolvedValue({ supported: true }); api.strengths.mockResolvedValue({ supported: true })
 const submit = vi.fn()
 render(<SessionConfirmCard myUserId="a" partnerUserId="b" session={{ interview_category: 'case' }} onSubmit={submit} />)
 fireEvent.click(screen.getByText('Yes, we completed it'))
 fireEvent.click(screen.getByText('Continue'))
 screen.getAllByRole('checkbox').forEach(c => fireEvent.click(c))
 await waitFor(() => expect(screen.getByText('Continue').disabled).toBe(false))
 fireEvent.click(screen.getByText('Continue'))
 await screen.findByText('What went well?')
 const skill = screen.getByRole('button', { name: 'Structuring' })
 fireEvent.click(skill); expect(skill.getAttribute('aria-pressed')).toBe('true')
 fireEvent.click(skill); expect(skill.getAttribute('aria-pressed')).toBe('false')
 fireEvent.click(skill)
 fireEvent.click(screen.getByText('Responsive')); fireEvent.click(screen.getByText('Reliable')); fireEvent.click(screen.getByText('Reliable'))
 expect(screen.getByText('Add a private tip · Optional').parentElement.open).toBe(false)
 fireEvent.click(screen.getByText('Continue')); fireEvent.click(screen.getByText('Submit confirmation'))
 expect(submit).toHaveBeenCalledWith(expect.objectContaining({ strengthSkills: ['structuring', 'responsive'], outcome: 'completed', suggestionCode: null }))
})
it('does not pretend to collect strengths before the migration is installed', async () => {
 api.teammate.mockResolvedValue({ supported: false }); api.feedback.mockResolvedValue({ supported: false }); api.strengths.mockResolvedValue({ supported: false })
 render(<SessionConfirmCard myUserId="a" partnerUserId="b" onSubmit={vi.fn()} />)
 fireEvent.click(screen.getByText('Yes, we completed it')); fireEvent.click(screen.getByText('Continue'))
 screen.getAllByRole('checkbox').forEach(c => fireEvent.click(c))
 await waitFor(() => expect(screen.getByText('Continue').disabled).toBe(false))
 fireEvent.click(screen.getByText('Continue'))
 expect(screen.getByText('Submit confirmation')).toBeTruthy()
 expect(screen.queryByText('What did your partner do well?')).toBeNull()
})
it('requires explicit sharing consent and retains the saved state on failure', async () => {
 api.share.mockResolvedValueOnce({ data: false }).mockResolvedValueOnce({ error: new Error('offline') })
 render(<PeerStrengthSharing communityId="c" />)
 const checkbox = await screen.findByRole('checkbox'); expect(checkbox.checked).toBe(false)
 fireEvent.click(checkbox); await screen.findByRole('alert'); expect(checkbox.checked).toBe(false)
 expect(api.share).toHaveBeenLastCalledWith('c', true)
})
