import { useCallback, useEffect, useRef, useState } from 'react'
import { buddyRpc } from '../../lib/buddy/api'
import StoryDialog from '../stories/StoryDialog'
import '../stories/StoryGarden.css'
import './assigned-invitations.css'

const CHANGED='mutu-buddy-invitations-changed'
export default function AssignedBuddyInvitations({program=null,presentation='popup',suppressed=false,onAccepted,onAvailability,rpc=buddyRpc}) {
 const [invitations,setInvitations]=useState([]),[loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[dismissed,setDismissed]=useState([])
 const live=useRef(false),lock=useRef(false),sequence=useRef(0)
 const reload=useCallback(async()=>{
  const seq=++sequence.current
  try{
   const data=await rpc('buddy_assigned_invitations',{p_program:program})
   if(live.current&&seq===sequence.current){setInvitations(data?.invitations||[]);setError('')}
  }catch(e){if(live.current&&seq===sequence.current)setError(/buddy_assigned_invitations|schema cache/i.test(e.message)?'Buddy invitations are waiting for a program update.':e.message)}
  finally{if(live.current&&seq===sequence.current)setLoading(false)}
 },[program,rpc])
 useEffect(()=>{
  live.current=true;reload()
  const tick=()=>{if(!document.hidden&&!lock.current)reload()}
  const timer=setInterval(tick,30000)
  window.addEventListener('focus',tick);window.addEventListener(CHANGED,tick)
  return()=>{live.current=false;sequence.current++;clearInterval(timer);window.removeEventListener('focus',tick);window.removeEventListener(CHANGED,tick)}
 },[reload])
 useEffect(()=>{onAvailability?.(invitations.length>0)},[invitations,onAvailability])
 async function respond(invite,accept){
  if(lock.current)return
  lock.current=true;setBusy(true);setError('')
  try{
   const result=await rpc('buddy_assigned_respond',{p_pair:invite.id,p_accept:accept})
   if(!live.current)return
   sequence.current++;setInvitations(items=>items.filter(item=>item.id!==invite.id))
   window.dispatchEvent(new Event(CHANGED))
   if(accept)await onAccepted?.(result)
  }catch(e){if(live.current)setError(e.message||'This invitation could not be updated. Please try again.')}
  finally{lock.current=false;if(live.current)setBusy(false)}
 }
 const visible=presentation==='popup'?invitations.filter(i=>!dismissed.includes(i.id)).slice(0,1):invitations
 function later(){if(!lock.current)setDismissed(ids=>[...ids,...visible.map(i=>i.id)])}
 const cards=visible.map(invite=><article className="bai-card" key={invite.id}>
  <p><strong>{invite.mentor_name}</strong> invited you to be their Buddy in {invite.program_name}.</p>
  <p className="bai-note">Accept to join as a first year student and confirm this Buddy pairing. Your names will be shared with each other.</p>
  {invite.unavailable_reason&&<p role="status">{invite.unavailable_reason}</p>}
  <div className="bai-actions">
   <button type="button" className="bai-accept" disabled={busy||!invite.can_accept} onClick={()=>respond(invite,true)}>{busy?'Updating…':'Accept invitation'}</button>
   <button type="button" disabled={busy} onClick={()=>respond(invite,false)}>Decline</button>
  </div>
 </article>)
 if(presentation==='popup')return !suppressed&&visible.length>0?<StoryDialog title="You have an invitation from an upper year Buddy" onClose={later}>
  {cards}{error&&<p role="alert">{error}</p>}
  <button type="button" className="bai-later" disabled={busy} onClick={later}>Not now</button>
 </StoryDialog>:null
 return loading?<p role="status">Checking for Buddy invitations…</p>:invitations.length||error?<section className="bai-inbox" aria-label="Buddy invitations">
  {cards.length>0&&<h2>You have an invitation from an upper year Buddy</h2>}{cards}
  {error&&<div role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={reload}>Check invitations again</button></div>}
 </section>:null
}
