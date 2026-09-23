import { beforeEach, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))
import { browsePracticeRequests, fetchPracticeRecommendationPreferences, savePracticeRecommendationPreferences } from '../practice'
beforeEach(()=>rpc.mockReset())
it('uses the server recommendation order',async()=>{
 rpc.mockResolvedValue({data:[{request_id:'b'},{request_id:'a'}],error:null})
 expect((await browsePracticeRequests('c')).data.map(r=>r.request_id)).toEqual(['b','a'])
 expect(rpc).toHaveBeenCalledTimes(1)
})
it('falls back only when the new function is missing',async()=>{
 rpc.mockResolvedValueOnce({data:null,error:{code:'PGRST202'}}).mockResolvedValueOnce({data:[{request_id:'legacy'}],error:null})
 expect(await browsePracticeRequests('c')).toMatchObject({recommendationsSupported:false,data:[{request_id:'legacy'}]})
 expect(rpc).toHaveBeenLastCalledWith('browse_practice_requests',{p_community_id:'c'})
})
it('does not mask permission or network failures with legacy matches',async()=>{
 rpc.mockResolvedValue({data:null,error:{code:'42501'}})
 expect((await browsePracticeRequests('c')).error.code).toBe('42501')
 expect(rpc).toHaveBeenCalledTimes(1)
})

it('gets extended private preferences and falls back only for a missing RPC', async () => {
 rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
   .mockResolvedValueOnce({ data: { focus_skills: ['synthesis'] }, error: null })
 expect(await fetchPracticeRecommendationPreferences('c')).toMatchObject({ supported: true, data: { focus_skills: ['synthesis'] } })
 expect(rpc).toHaveBeenLastCalledWith('practice_recommendation_preferences_get', { p_community_id: 'c' })
 rpc.mockReset().mockResolvedValue({ data: null, error: { code: '42501' } })
 expect((await fetchPracticeRecommendationPreferences('c')).supported).toBe(false)
 expect(rpc).toHaveBeenCalledOnce()
})
it('saves supported starting experience with skills in one RPC and does not retry a failed write', async () => {
 rpc.mockResolvedValue({ error: { code: '42501' } })
 const prefs = { focus_skills: ['synthesis'], support_skills: [], share_response: false,
   prior_practice_supported: true, prior_practice: { case: '5_to_10' } }
 expect((await savePracticeRecommendationPreferences('c', prefs)).error.code).toBe('42501')
 expect(rpc).toHaveBeenCalledExactlyOnceWith('practice_personal_preferences_save', {
   p_community_id: 'c', p_focus_skills: ['synthesis'], p_support_skills: [],
   p_share_response: false, p_prior_practice: { case: '5_to_10' },
 })
})
it('keeps legacy skill saving functional before the additive migration', async () => {
 rpc.mockResolvedValue({ error: null })
 await savePracticeRecommendationPreferences('c', { focus_skills: [], support_skills: [], share_response: false })
 expect(rpc).toHaveBeenCalledExactlyOnceWith('practice_recommendation_preferences_save', {
   p_community_id: 'c', p_focus_skills: [], p_support_skills: [], p_share_response: false,
 })
})
