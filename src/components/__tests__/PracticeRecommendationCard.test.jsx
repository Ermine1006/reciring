// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PartnerCard from '../practice/PartnerCard'
import RecommendationPreferences from '../practice/RecommendationPreferences'
import { feedbackFocusSuggestions } from '../../lib/practiceRecommendations'
afterEach(cleanup)
const request={want_types:['case'],help_types:['case']}
it('shows sourced reasons and response evidence without identity or a made up score',()=>{
 const invite=vi.fn(),row={...request,request_id:'r',recommendation:{support_skills:['synthesis'],relevant_skills:['synthesis'],response_record:{total:5,prompt:4},similar_response:true}}
 render(<PartnerCard row={row} myRequest={request} onInvite={invite} />)
 expect(screen.getByText('Can support your focus: Synthesis')).toBeTruthy()
 expect(screen.getByText('· Self selected')).toBeTruthy()
 expect(screen.getByText('4 of 5 invitations answered within 48 hours')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Invite to practise'}))
 expect(invite).toHaveBeenCalledWith(row,null)
})
it('does not turn absent history into a low score',()=>{
 render(<PartnerCard row={request} myRequest={request} />)
 expect(screen.getByText('No shared response record yet')).toBeTruthy()
 expect(screen.getByText('Specific skills not shared yet')).toBeTruthy()
 expect(screen.queryByText(/0%/)).toBeNull()
})
it('requires explicit selection and save before applying private feedback or sharing responses',async()=>{
 const save=vi.fn().mockResolvedValue({})
 render(<RecommendationPreferences request={request} value={{support_skills:[],focus_skills:[],share_response:false}} suggestions={['synthesis']} onSave={save} />)
 expect(screen.getByRole('checkbox',{hidden:true}).checked).toBe(false)
 expect(save).not.toHaveBeenCalled()
 fireEvent.click(screen.getByText('Personalise my recommendations'))
 fireEvent.click(screen.getByRole('button',{name:'+ Synthesis'}))
 fireEvent.click(screen.getByRole('button',{name:'Save & refresh recommendations'}))
 expect(save).toHaveBeenCalledWith({support_skills:[],focus_skills:['synthesis'],share_response:false})
 await screen.findByText('Saved. Recommendations refreshed.')
})
it('excludes sent, disputed, reported and unverified feedback from suggested focus',()=>{
 const feedback=[{session_id:'v',recipient_user_id:'me',suggestion_code:'tailor_structure'}, {session_id:'v',recipient_user_id:'peer',suggestion_code:'explain_calculations'}, {session_id:'d',recipient_user_id:'me',suggestion_code:'recommendation_more_direct'}, {session_id:'v',recipient_user_id:'me',suggestion_code:'clearer_context',reported_at:'today'}]
 expect(feedbackFocusSuggestions(feedback,[{id:'v',status:'verified'},{id:'d',status:'disputed'}],'me')).toEqual(['structuring','hypothesis_development'])
})
