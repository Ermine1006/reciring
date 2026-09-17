// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import GuidedPractice from '../practice/GuidedPractice'
vi.mock('../../lib/analytics',()=>({track:vi.fn()}))
afterEach(()=>{cleanup();localStorage.clear()})
const session={id:'s',status:'scheduled',participant_a_user_id:'me',participant_b_user_id:'peer',session_mode:'full_mock_swap',interview_category:'case',round1_interviewee_user_id:'me',scheduled_start:'2099-09-17T16:00:00Z',duration_minutes:75,timezone:'America/Toronto',location_type:'in_person'}
it('keeps the start action outside the scroll area and collapses preparation',()=>{
 const {container}=render(<GuidedPractice session={session} pairing={{status:'accepted'}} userId="me" partnerName="Partner"/>);
 const scroll=container.querySelector('.phone-scroll'),start=screen.getByRole('button',{name:'Start this round'})
 expect(scroll).toBeTruthy();expect(scroll.contains(start)).toBe(false)
 expect(screen.getByText('Preparation & guide tips').closest('details').open).toBe(false)
 expect(screen.queryByText('A video or voice call')).toBeNull()
 fireEvent.click(start)
 expect(container.querySelector('.phone-scroll')).toBeTruthy()
 expect(screen.getByText(/of \d/)).toBeTruthy()
})
it('requires choosing roles and preserves close navigation',()=>{
 const close=vi.fn();render(<GuidedPractice session={{...session,round1_interviewee_user_id:null}} pairing={{status:'accepted'}} userId="me" partnerName="Partner" onClose={close}/>);
 expect(screen.getByRole('button',{name:'Start this round'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'I start as candidate'}));expect(screen.getByRole('button',{name:'Start this round'}).disabled).toBe(false)
 fireEvent.click(screen.getByRole('button',{name:'Close'}));expect(close).toHaveBeenCalled()
})
