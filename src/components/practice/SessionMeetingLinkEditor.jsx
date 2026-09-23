import { useState } from 'react'
import { meetingLink } from '../../lib/meetingLink'
import { updatePracticeMeetingLink } from '../../lib/practice'
import { matchaCta } from '../../lib/matchaCta'

export default function SessionMeetingLinkEditor({ session, onSaved }) {
  const [open,setOpen]=useState(false)
  const [value,setValue]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const existing=session.meeting_url || session.location_detail || ''
  if(session.status!=='scheduled' || session.location_type!=='virtual') return null
  const save=async e=>{
    e.preventDefault()
    const parsed=meetingLink(value)
    if(!parsed || value.trim().length>500 || /\s/.test(value.trim())) {setError('Paste a valid Zoom, Google Meet or Teams HTTPS link.');return}
    setBusy(true);setError('')
    try {
      const {error:err}=await updatePracticeMeetingLink(session.id,parsed.url)
      if(err){setError(['PGRST202','42883'].includes(err.code) ? 'Saving links is not available yet. You can share the link in Messages for now.' : 'Could not save the link. Refresh the session and try again.');return}
      setOpen(false)
      await onSaved()
    }catch{setError('Could not save the link. Please try again.')}
    finally{setBusy(false)}
  }
  return <div className="practice-ui practice-meeting-editor" style={{marginTop:10,fontSize:13}}>
    {!open ? <button type="button" onClick={()=>{setValue(existing);setError('');setOpen(true)}} style={{...matchaCta,width:'100%',border:0,borderRadius:12,padding:12,cursor:'pointer'}}>{existing ? 'Edit meeting link' : 'Add meeting link'}</button> :
      <form onSubmit={save}>
        <label style={{display:'block',fontWeight:650}}>Virtual meeting link
          <input type="url" autoFocus required maxLength={500} value={value} disabled={busy} onChange={e=>setValue(e.target.value)} placeholder="Paste Zoom, Google Meet or Teams link" style={{display:'block',boxSizing:'border-box',width:'100%',marginTop:6,padding:12,border:'1px solid #ddd',borderRadius:10,fontSize:14}} />
        </label>
        <p style={{fontSize:12,color:'#6E6A61'}}>Only you and your practice partner can see this link.</p>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy} style={{...matchaCta,border:0,borderRadius:10,padding:12}}>{busy ? 'Saving…' : 'Save meeting link'}</button>
        <button type="button" disabled={busy} onClick={()=>setOpen(false)} style={{marginLeft:12}}>Cancel</button>
      </form>}
  </div>
}
