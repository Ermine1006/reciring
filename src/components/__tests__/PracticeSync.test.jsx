// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, renderHook, act } from '@testing-library/react'
import usePracticeSync from '../../lib/usePracticeSync'
const mocks = vi.hoisted(() => ({ pairings: vi.fn(), sessions: vi.fn() }))
vi.mock('../../lib/practice', () => ({ fetchMyPairings: mocks.pairings, fetchMySessions: mocks.sessions }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks() })
const setup = (extra={}) => {
 mocks.pairings.mockResolvedValue({data:[],error:null}); mocks.sessions.mockResolvedValue({data:[],error:null})
 const onChange=vi.fn().mockResolvedValue(undefined)
 const hook=renderHook(props => usePracticeSync(props),{initialProps:{userId:'recipient',enabled:true,pairings:[],sessions:[],onChange,...extra}})
 return {...hook,onChange}
}
it('refreshes an already open recipient page when an invitation arrives',async()=>{
 vi.useFakeTimers(); const {onChange}=setup()
 mocks.pairings.mockResolvedValue({data:[{id:'invite',status:'invited',i_invited:false}],error:null})
 await act(async()=>vi.advanceTimersByTimeAsync(15000))
 expect(onChange).toHaveBeenCalledTimes(1)
})
it('refreshes sender acceptance and proposed session changes on focus',async()=>{
 const {onChange}=setup({pairings:[{id:'pair',status:'invited'}]})
 mocks.pairings.mockResolvedValue({data:[{id:'pair',status:'accepted'}],error:null})
 mocks.sessions.mockResolvedValue({data:[{id:'session',status:'scheduled'}],error:null})
 await act(async()=>window.dispatchEvent(new Event('focus')))
 expect(onChange).toHaveBeenCalledTimes(1)
})
it('does not reload unchanged data or turn an error into an empty state',async()=>{
 const {onChange}=setup()
 await act(async()=>window.dispatchEvent(new Event('focus')))
 expect(onChange).not.toHaveBeenCalled()
 mocks.pairings.mockResolvedValue({error:{message:'offline'}})
 await act(async()=>window.dispatchEvent(new Event('online')))
 expect(onChange).not.toHaveBeenCalled()
})
it('discards results arriving after the account changes',async()=>{
 const {onChange,rerender}=setup()
 let resolve; mocks.pairings.mockReturnValue(new Promise(r=>{resolve=r}))
 await act(async()=>window.dispatchEvent(new Event('focus')))
 rerender({userId:'other-account',enabled:true,pairings:[],sessions:[],onChange})
 await act(async()=>resolve({data:[{id:'old-account',status:'invited'}]}))
 expect(onChange).not.toHaveBeenCalled()
})
it('stops polling after unmount',async()=>{
 vi.useFakeTimers();const {unmount}=setup();unmount()
 await act(async()=>vi.advanceTimersByTimeAsync(30000))
 expect(mocks.pairings).not.toHaveBeenCalled()
})
