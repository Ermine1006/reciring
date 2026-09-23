import { useCallback, useEffect, useRef, useState } from 'react'
import { Sprout } from 'lucide-react'
import { buddyRpc } from '../../lib/buddy/api'
import { Button } from './BuddyChoiceDemo'
import './assigned.css'

export function parseBuddyList(text) {
 const rows=text.split(/\n|;/).map(s=>s.trim()).filter(Boolean)
 if(!rows.length||rows.length>10)throw new Error('Add one to ten school emails.')
 const seen=new Set()
 return rows.map(row=>{
  const email=row.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase()
  if(!email)throw new Error('Check each school email.')
  const name=row.replace(/<?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}>?/i,'').replace(/[<>]/g,'').replace(/^[\s:–—-]+|[\s:–—-]+$/g,'').trim()
  if(name.length>100||email.length>254)throw new Error('Keep names and emails short.')
  if(seen.has(email))return null
  seen.add(email);return {name,email}
 }).filter(Boolean)
}
const status=r=>r?.resolved?'Resolved':r?.replied?'Replied':r?'Needs a hand':'Say hello'
export default function BuddyAssigned({program,role,rpc=buddyRpc,initialRoster='',onDirtyChange,coordinator=false}) {
 const [pairs,setPairs]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [busy,setBusy]=useState(false),[add,setAdd]=useState(false),[review,setReview]=useState(null),[roster,setRoster]=useState(initialRoster)
 const [pairId,setPairId]=useState(null),[requestId,setRequestId]=useState(null),[draft,setDraft]=useState(''),[asking,setAsking]=useState(false)
 const [summary,setSummary]=useState(null),[summaryError,setSummaryError]=useState('')
 const live=useRef(true),lock=useRef(false),sequence=useRef(0),dirty=useRef(false)
 const upper=role==='upper',pair=pairs.find(p=>p.id===pairId),request=pair?.requests?.find(r=>r.id===requestId)
 const refresh=useCallback(async(quiet=false)=>{
  const seq=++sequence.current
  try{const result=await rpc('buddy_assigned_state',{p_program:program});if(live.current&&seq===sequence.current){setPairs(result.pairs||[]);setError('')}}
  catch(e){if(live.current&&seq===sequence.current&&!quiet)setError(/buddy_assigned|schema cache/i.test(e.message)?'My Buddies needs its database update. Your other Together features are still available.':e.message)}
  finally{if(live.current&&seq===sequence.current)setLoading(false)}
 },[program,rpc])
 useEffect(()=>{
  live.current=true;setLoading(true);refresh()
  const tick=()=>{if(!document.hidden&&!lock.current)refresh(true)}
  const timer=setInterval(tick,10000);window.addEventListener('focus',tick)
  return()=>{live.current=false;sequence.current++;clearInterval(timer);window.removeEventListener('focus',tick)}
 },[refresh])
 useEffect(()=>()=>onDirtyChange?.(false),[onDirtyChange])
 function changed(value){dirty.current=value;onDirtyChange?.(value)}
 function move(fn){if(dirty.current&&!window.confirm('Leave without sending your changes?'))return;changed(false);setDraft('');setError('');fn()}
 async function act(name,args,message,done){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await rpc(name,args);if(!live.current)return;changed(false);await refresh();setNotice(message);done?.()}catch(e){if(live.current)setError(e.message)}finally{lock.current=false;if(live.current)setBusy(false)}}
 async function report(){try{setSummary(await rpc('buddy_assigned_summary',{p_program:program}));setSummaryError('')}catch(e){setSummaryError(e.message)}}
 const reset=()=>{setPairId(null);setRequestId(null);setAsking(false);setAdd(false);setReview(null)}
 return <section className="ba-root" aria-label={upper?'My Buddies':'My Buddy'}>
  {error&&<div className="bc-card" role="alert"><p>{error}</p><Button disabled={busy} onClick={()=>refresh()}>Try again</Button> <a href="/buddy-demo">Try the demo</a></div>}
  {notice&&<p className="bc-notice" role="status">{notice}</p>}
  {loading?<p role="status">Finding your crew…</p>:add?<>
   <Button disabled={busy} onClick={()=>move(reset)}>‹ My Buddies</Button>
   <h2>{review?'Your Buddy crew':'Add my Buddies'}</h2>
   {review?<><p className="ba-muted">Check your school pairing.</p>{review.map(s=><article className="ba-person" key={s.email}><strong>{s.name||s.email}</strong><small>{s.email}</small></article>)}<Button primary disabled={busy} onClick={()=>act('buddy_assigned_add',{p_program:program,p_students:review},'Added. Each student can confirm in My Buddy.',reset)}>Add {review.length} {review.length===1?'Buddy':'Buddies'}</Button><Button disabled={busy} onClick={()=>setReview(null)}>Edit list</Button><p className="ba-muted">They confirm with their school account. No email is sent.</p></>:<form onSubmit={e=>{e.preventDefault();try{setReview(parseBuddyList(roster));setError('')}catch(e){setError(e.message)}}}>
    <label className="ba-field">School names and emails<textarea required value={roster} disabled={busy} onChange={e=>{setRoster(e.target.value);changed(true)}} placeholder={'Name <student@rotman.utoronto.ca>\nOne student per line'}/></label>
    <p className="ba-muted">Paste the list your school sent you.</p><button className="ba-cta" type="submit">Review my Buddies →</button>
   </form>}
  </>:pair?<>
   <Button disabled={busy} onClick={()=>move(reset)}>‹ {upper?'My Buddies':'My Buddy'}</Button>
   <span className="ba-eyebrow">School assigned</span><h2>{pair.name}</h2>{pair.email&&<p className="ba-muted">{pair.email}</p>}
   {pair.status!=='confirmed'?<div className="ba-empty"><p>{pair.status==='declined'?'Pairing needs correction. Please contact your coordinator.':upper?'Waiting for your student to confirm.':'Is this your school assigned Buddy?'}</p>{!upper&&pair.status==='pending'&&<><Button primary disabled={busy} onClick={()=>act('buddy_assigned_confirm',{p_pair:pair.id,p_accept:true},'You are connected.')}>Confirm my Buddy</Button><Button disabled={busy} onClick={()=>act('buddy_assigned_confirm',{p_pair:pair.id,p_accept:false},'Pairing marked for correction.')}>Needs correction</Button><p className="ba-muted">Your names and requests are shared within this pair. The school sees participation counts.</p></>}</div>:<>
    {!upper&&!asking&&<Button disabled={busy} primary onClick={()=>move(()=>{setAsking(true);setRequestId(null)})}>Ask my Buddy</Button>}
    {asking?<form onSubmit={e=>{e.preventDefault();act('buddy_assigned_ask',{p_pair:pair.id,p_body:draft},'Question sent.',()=>{setDraft('');setAsking(false)})}}><label className="ba-field">What would help?<textarea required maxLength={1000} value={draft} disabled={busy} onChange={e=>{setDraft(e.target.value);changed(true)}}/></label><p className="ba-muted">Your name is shown. Only your Buddy can read this.</p><button className="ba-cta" disabled={busy||!draft.trim()}>Send question →</button></form>:<>
     {(pair.requests||[]).map(r=><button className="ba-request" type="button" key={r.id} disabled={busy} aria-pressed={requestId===r.id} onClick={()=>move(()=>setRequestId(r.id))}><span>{r.body}</span><small>{status(r)} →</small></button>)}
     {!pair.requests?.length&&<div className="ba-empty"><Sprout aria-hidden="true"/><h3>No questions yet</h3><p>{upper?'A little help starts here.':'Ask one small question.'}</p></div>}
     {request&&<div className="ba-thread"><h3>{request.body}</h3>{request.replies.map(r=><article className={r.mine?'ba-reply ba-mine':'ba-reply'} key={r.id}><small>{r.name}{r.mine?' · You':''}</small><p>{r.body}</p></article>)}
      {request.resolved?<p className="bc-notice">Marked resolved by the student.</p>:<form onSubmit={e=>{e.preventDefault();act('buddy_assigned_reply',{p_request:request.id,p_body:draft},'Reply sent.',()=>setDraft(''))}}><label className="ba-field">Your reply<textarea required maxLength={2000} value={draft} disabled={busy} onChange={e=>{setDraft(e.target.value);changed(true)}}/></label>{upper&&<Button disabled={busy} onClick={()=>{setDraft('Happy to help. Would a 15 minute chat after class work for you?');changed(true)}}>Suggest a quick chat</Button>}<button className="ba-cta" disabled={busy||!draft.trim()}>Send reply →</button></form>}
      {!upper&&<Button disabled={busy} onClick={()=>act('buddy_assigned_resolve',{p_request:request.id,p_resolved:!request.resolved},request.resolved?'Request reopened.':'Glad it helped.')}>{request.resolved?'Reopen request':'This helped ✓'}</Button>}
     </div>}
    </>}
   </>}
  </>:<>
   <div className="ba-hero"><div><span className="ba-eyebrow">School assigned</span><h2>{upper?'Meet your Buddy crew':'Your Buddy, right here.'}</h2><p>A little help goes a long way.</p></div><span className="ba-hero-art" aria-hidden="true"/></div>
   {upper&&!pairs.length&&<Button primary disabled={busy} onClick={()=>setAdd(true)}>Add my Buddies →</Button>}
   {pairs.map(p=>{const needs=p.requests?.find(r=>!r.resolved&&!r.replied),latest=needs||p.requests?.[0];return <article className="ba-card" key={p.id}><div className="ba-card-head"><h3>{p.name}</h3><span className="ba-status">{p.status==='pending'?'Confirm pairing':p.status==='declined'?'Check pairing':status(latest)}</span></div><p>{p.status==='confirmed'?(latest?.body||'A little help starts here.'):(upper?'Waiting to connect your accounts.':'Your school pairing is ready.')}</p><Button primary={p.status==='confirmed'&&!!needs} disabled={busy} onClick={()=>move(()=>{setPairId(p.id);setRequestId(latest?.id||null);setAsking(false)})}>{p.status==='pending'&&!upper?'Confirm':needs&&upper?'Reply →':'Open →'}</Button></article>})}
   {!upper&&!pairs.length&&!error&&<div className="ba-empty"><h3>Ready when you are.</h3><p>Your mentor can add your verified school email.</p></div>}
   <div className="ba-footer">{upper&&pairs.length>0&&<Button disabled={busy} onClick={()=>setAdd(true)}>+ Add Buddies</Button>}<Button disabled={busy} onClick={()=>refresh()}>Refresh</Button></div>
  </>}
  {coordinator&&<details className="ba-report"><summary>Program overview</summary><Button onClick={report}>Load counts</Button>{summaryError&&<p role="alert">{summaryError}</p>}{summary&&<dl>{Object.entries(summary).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>}<p className="ba-muted">Participation counts only. Replies stay private. Resolved requests are not verified meetings.</p></details>}
 </section>
}
