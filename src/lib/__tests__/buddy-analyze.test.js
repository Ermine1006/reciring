import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn()}))
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:mocks.getUser},rpc:mocks.rpc})}))
import handler from '../../../api/buddy-analyze.js'
function response(){return {code:0,body:null,setHeader:vi.fn(),status(code){this.code=code;return this},json(body){this.body=body;return this},end(){return this}}}
beforeEach(()=>{vi.stubEnv('VITE_SUPABASE_URL','https://example.test');vi.stubEnv('VITE_SUPABASE_ANON_KEY','test');vi.stubEnv('OPENROUTER_API_KEY','test');mocks.getUser.mockResolvedValue({data:{user:{id:crypto.randomUUID()}}});mocks.rpc.mockResolvedValue({data:{programs:[{id:'program'}]}})})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks()})
it('rejects anonymous and non-roster requests before sending anything to AI',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);let res=response();await handler({method:'POST',headers:{},body:{}},res);expect(res.code).toBe(401)
 mocks.rpc.mockResolvedValue({data:{programs:[]}});res=response();await handler({method:'POST',headers:{authorization:'Bearer test'},body:{}},res);expect(res.code).toBe(403);expect(fetch).not.toHaveBeenCalled()
})
it('keeps only allowed topics and cannot turn an empty offer into claimed expertise',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({need_topics:['finance','made_up'],offer_topics:['recruiting'],profile_topics:['technology']})}}]})}))
 const res=response();await handler({method:'POST',headers:{authorization:'Bearer test'},body:{need:'Finance help',offer:'',experience:''}},res)
 expect(res.code).toBe(200);expect(res.body).toEqual({need_topics:['finance'],offer_topics:[],profile_topics:[]});expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
it('falls back to manual topics when the provider fails',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('provider failed')))
 const res=response();await handler({method:'POST',headers:{authorization:'Bearer test'},body:{need:'Recruiting help'}},res);expect(res.code).toBe(503);expect(res.body.error).toContain('Select support topics')
})
