// @vitest-environment jsdom
import React, { useState } from 'react'
import { it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import SkillRatings from '../practice/SkillRatings'
import { feedbackSkills, validSkillRatings } from '../../data/practiceSkillRatings'
afterEach(cleanup)
function Form() {
 const [value, setValue] = useState({})
 return <SkillRatings category="case" value={value} onChange={setValue} />
}
it('offers case leadership and preserves the behavioural rubric', () => {
 expect(feedbackSkills('case').some(s => s.key === 'leadership')).toBe(true)
 expect(feedbackSkills('case', false).some(s => s.key === 'leadership')).toBe(false)
 expect(feedbackSkills('behavioural')).toHaveLength(8)
 expect(feedbackSkills('behavioural').some(s => s.key === 'leadership')).toBe(false)
 expect(validSkillRatings({leadership: 5}, 'case')).toBe(true)
 for (const ratings of [{leadership:0}, {leadership:6}, {leadership:2.5}, {leadership:'5'}, {unknown:3}]) expect(validSkillRatings(ratings,'case')).toBe(false)
 expect(validSkillRatings({leadership:5},'behavioural')).toBe(false)
})
it('starts without ratings, caps at three, and lets users clear a rating', () => {
 render(<Form />)
 fireEvent.click(screen.getByText('Rate observed skills · Optional'))
 for (const name of ['Leadership','Structuring','Synthesis']) {
  expect(screen.getByLabelText(`Rate ${name}`).value).toBe('')
  fireEvent.change(screen.getByLabelText(`Rate ${name}`), {target:{value:'4'}})
 }
 expect(screen.getByLabelText('Rate Communication').disabled).toBe(true)
 fireEvent.change(screen.getByLabelText('Rate Leadership'), {target:{value:''}})
 expect(screen.getByLabelText('Rate Communication').disabled).toBe(false)
})
