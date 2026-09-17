import { beforeEach, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))
import { browsePracticeRequests } from '../practice'
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
