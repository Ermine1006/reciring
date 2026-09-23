import { useState } from 'react'
import { formatSessionTime, wallTimeToUtc } from '../../lib/practiceMatching'
import { proposePracticeTimeChange, respondPracticeTimeChange } from '../../lib/practice'
import { matchaCta } from '../../lib/matchaCta'

function localParts(session) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:session.timezone || 'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(session.scheduled_start))
  const get = key => parts.find(p=>p.type===key)?.value
  return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`}
}
export default function SessionTimeChange({session,currentUserId,onSaved}) {
  const [open,setOpen]=useState(false),[date,setDate]=useState(''),[time,setTime]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const tz=session.timezone || 'America/Toronto'
  const pending=Boolean(session.time_change_id),mine=session.time_change_by===currentUserId
  const act=async fn=>{
    setBusy(true);setError('')
    try{const {error:err}=await fn();if(err){setError(['PGRST202','42883'].includes(err.code)?'Time changes are not available yet. Please agree on a time in Messages.':'Could not update this proposal. Refresh the session and try again.');return}setOpen(false);await onSaved()}
    catch{setError('Could not update this proposal. Please try again.')}
    finally{setBusy(false)}
  }
  const propose=e=>{
    e.preventDefault();const start=wallTimeToUtc(date,time,tz)
    if(!start || !Number.isFinite(new Date(start).getTime()) || new Date(start)<=new Date() || new Date(start).getTime()===new Date(session.scheduled_start).getTime()){setError('Choose a different time in the future.');return}
    act(()=>proposePracticeTimeChange(session.id,start))
  }
  return <div className="practice-ui practice-time-change" style={{marginTop:12,fontSize:13}}>
    {pending ? <div style={{background:'#F8F3E5',padding:12,borderRadius:12}}>
      <strong>{mine?'Time change sent':'Your partner suggested a new time'}</strong>
      <p>{formatSessionTime(session.time_change_start,session.duration_minutes,tz)}</p>
      <p>The current booking stays until you both agree.</p>
      {!mine && <button style={{...matchaCta,padding:10,border:0,borderRadius:10}} disabled={busy} onClick={()=>act(()=>respondPracticeTimeChange(session.id,session.time_change_id,true))}>Accept new time</button>}
      <button disabled={busy} onClick={()=>act(()=>respondPracticeTimeChange(session.id,session.time_change_id,false))} style={{marginLeft:8}}>{mine?'Withdraw proposal':'Keep current time'}</button>
    </div> : open ? <form onSubmit={propose}>
      <strong>Suggest a new time</strong>
      <div style={{display:'flex',flexWrap:'wrap',gap:8,margin:'10px 0'}}><label>Date<input type="date" required value={date} disabled={busy} onChange={e=>setDate(e.target.value)} style={{display:'block',padding:8}}/></label><label>Time<input type="time" required value={time} disabled={busy} onChange={e=>setTime(e.target.value)} style={{display:'block',padding:8}}/></label></div>
      <p>{tz} · {session.duration_minutes} min. Meeting link and practice details stay the same.</p>
      <button type="submit" disabled={busy} style={{...matchaCta,padding:10,border:0,borderRadius:10}}>{busy?'Sending…':'Send new time'}</button><button type="button" disabled={busy} onClick={()=>setOpen(false)} style={{marginLeft:12}}>Cancel</button>
    </form> : <button type="button" onClick={()=>{const parts=localParts(session);setDate(parts.date);setTime(parts.time);setError('');setOpen(true)}} style={{width:'100%',padding:12,borderRadius:12,border:'1px solid #E8D9A7',background:'#F8F3E5',color:'#A6822A',cursor:'pointer'}}>Suggest a new time</button>}
    {error && <p role="alert">{error}</p>}
  </div>
}
