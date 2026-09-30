import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import AppScreen from '../AppScreen'
import BuddyAssigned from './BuddyAssigned'
import SubmitRequest from '../SubmitRequest'
import { HELP_TYPES } from '../../data/requestOptions'
import { getCareerFocusOptions } from '../../data/careerFocus'
import { buddyRpc } from '../../lib/buddy/api'
import { Button, Post, Preview } from './BuddyChoiceDemo'
import './choice-demo.css'
import './choice-program.css'
import BuddyRecommendations, { UpperBuddyProfile } from './BuddyRecommendations'
import PeerAvatar from '../PeerAvatar'

// Guarding a post that is not published and a Buddy list that is not
// added. Neither sends anything, so the prompt does not say "sending".
const LEAVE_PROMPT='Leave without saving? Your changes will not be kept.'
const CAREER_FOCUS_OPTIONS=getCareerFocusOptions().map(option=>option.label)
const postIsExpired = post => {
 const value=post?.expiresAt
 if(!value)return false
 const time=+new Date(value)
 return Number.isFinite(time)&&time<=Date.now()
}
function ChoiceChips({legend,options,value,onChange,max,disabled=false}) {
 return <fieldset className="bc-apply-options" disabled={disabled}><legend>{legend}</legend><div>{options.map(option=><button type="button" key={option} aria-pressed={value.includes(option)} disabled={disabled||(!value.includes(option)&&value.length>=max)} onClick={()=>onChange(value.includes(option)?value.filter(x=>x!==option):[...value,option])}>{option}</button>)}</div><small>Choose up to {max}</small></fieldset>
}
function ApplicationSummary({application}) {
 if(!application)return null
 return <div className="bc-application-summary"><p><strong>Help topics</strong><br/>{application.help_topics?.length?application.help_topics.join(' · '):'Not added'}</p><p><strong>Career focus</strong><br/>{application.career_focus?.length?application.career_focus.join(' · '):'Not added'}</p></div>
}
function UpperApplicationGate({application,busy,enabled,help,focus,onHelp,onFocus,onResubmit,onRefresh}) {
 const status=application?.status
 if(status==='pending')return <section className="bc-card bc-join bc-application-pending"><span className="bc-eyebrow">Application pending</span><h2>Thanks for offering to help</h2><p>A program admin will review your application. First year requests stay private until you are approved.</p><ApplicationSummary application={application}/><p className="bc-audience">Your year is locked to this application while it is under review.</p></section>
 if(status==='declined')return <section className="bc-card bc-join"><span className="bc-eyebrow">Application not approved</span><h2>Update and apply again</h2><p>You can update your help preferences and resubmit. This account cannot switch into the first year flow while an upper year application is on record.</p><div className="bc-upper-application"><ChoiceChips legend="Help topics" options={HELP_TYPES} value={help} onChange={onHelp} max={3} disabled={busy}/><ChoiceChips legend="Career focus" options={CAREER_FOCUS_OPTIONS} value={focus} onChange={onFocus} max={2} disabled={busy}/></div><Button primary disabled={busy||!enabled||!help.length} onClick={onResubmit}>{busy?'Submitting…':'Submit application again'}</Button></section>
 if(status==='paused')return <section className="bc-card bc-join bc-application-pending"><span className="bc-eyebrow">Upper year access paused</span><h2>Your Buddy Program access is paused</h2><p>First year requests stay private while access is paused. Contact the program admin if this needs to be restored or corrected.</p><ApplicationSummary application={application}/></section>
 return <section className="bc-card bc-join"><span className="bc-eyebrow">Upper year application</span><h2>Your application is on record</h2><p>This account stays on the upper year track. Refresh to check your latest approval status.</p><Button disabled={busy} onClick={onRefresh}>Refresh status</Button></section>
}
function FirstYearAccessGate({request,busy,mentorEmail,onMentorEmail,onRequest,onRefresh,onEdit,editing}) {
 const status=request?.status
 if(!request||editing)return <section className="bc-card bc-join"><span className="bc-eyebrow">First year access</span><h2>Find your assigned Buddy</h2><p>Enter the Rotman email of the upper year Buddy assigned to you. They will verify your first year access.</p><label className="bc-mentor-email">Assigned Buddy email<input type="email" value={mentorEmail} disabled={busy} onChange={e=>onMentorEmail(e.target.value)} placeholder="buddy@rotman.utoronto.ca" autoComplete="email"/></label><p className="bc-audience">Only this Buddy can verify your request. They must already be approved as an upper year Buddy Program participant.</p><Button primary disabled={busy||!mentorEmail.trim()} onClick={onRequest}>{busy?'Sending…':request?'Update request':'Request access →'}</Button>{request&&<Button disabled={busy} onClick={onRefresh}>Cancel</Button>}</section>
 if(status==='waiting_mentor_approval')return <section className="bc-card bc-join bc-application-pending"><span className="bc-eyebrow">Request saved</span><h2>Your Buddy needs access first</h2><p>We saved your request. Once your assigned Buddy is approved as an upper year participant, they can verify you.</p><p className="bc-mentor-value">{request.mentor_email}</p><div className="bc-gate-actions"><Button primary disabled={busy} onClick={onRefresh}>Check status</Button><Button disabled={busy} onClick={onEdit}>Change Buddy email</Button></div></section>
 if(status==='pending_verification')return <section className="bc-card bc-join bc-application-pending"><span className="bc-eyebrow">Request sent</span><h2>Waiting for your Buddy</h2><p>Your assigned Buddy can verify your first year access from their Buddy Program.</p><p className="bc-mentor-value">{request.mentor_email}</p><div className="bc-gate-actions"><Button primary disabled={busy} onClick={onRefresh}>Check status</Button><Button disabled={busy} onClick={onEdit}>Change Buddy email</Button></div></section>
 if(status==='not_confirmed')return <section className="bc-card bc-join"><span className="bc-eyebrow">Verification needs an update</span><h2>Check your Buddy email</h2><p>Your Buddy did not confirm this assignment. Check the email you entered or ask your program admin for help.</p><p className="bc-mentor-value">{request.mentor_email}</p><Button primary disabled={busy} onClick={onEdit}>Change Buddy email</Button></section>
 return <section className="bc-card bc-join bc-application-pending"><span className="bc-eyebrow">Access verified</span><h2>You're ready to join</h2><p>Your assigned Buddy confirmed your first year access.</p><Button primary disabled={busy} onClick={onRefresh}>Open Buddy Program</Button></section>
}
function MentorVerificationQueue({items=[],busy,onAction}) {
 if(!items.length)return null
 return <section className="bc-card bc-mentor-queue"><div className="bc-row"><h2>Buddy verification requests</h2><span className="bc-pill">{items.length}</span></div><p>These students entered your Rotman email as their assigned Buddy. Verify only students assigned to you.</p><div className="bc-application-list">{items.map(item=><article className="bc-application-row" key={item.id}><div><strong>{item.name||'First year student'}</strong><small>{item.email||''}</small></div><p className="bc-muted">Says you are their assigned upper year Buddy.</p><div className="bc-application-actions"><Button primary disabled={busy} onClick={()=>onAction(item.id,true)}>Verify Buddy</Button><Button disabled={busy} onClick={()=>onAction(item.id,false)}>Not my mentee</Button></div></article>)}</div></section>
}
function AdminApplications({items=[],busy,onAction}) {
 const pending=items.filter(item=>item.status==='pending')
 const others=items.filter(item=>item.status!=='pending')
 const row=item=><article className="bc-application-row" key={item.user_id}><div><strong>{item.name||'Student'}</strong><small>{item.email||''}</small><span className={`bc-application-status is-${item.status}`}>{item.status==='approved'?'Approved':item.status==='paused'?'Paused':item.status==='declined'?'Not approved':'Pending'}</span></div><ApplicationSummary application={item}/><div className="bc-application-actions">{item.status==='pending'&&<><Button primary disabled={busy} onClick={()=>onAction(item.user_id,'approve')}>Approve</Button><Button disabled={busy} onClick={()=>onAction(item.user_id,'decline')}>Decline</Button></>}{item.status==='declined'&&<Button primary disabled={busy} onClick={()=>onAction(item.user_id,'approve')}>Approve</Button>}{item.status==='approved'&&<Button disabled={busy} onClick={()=>onAction(item.user_id,'pause')}>Pause access</Button>}{item.status==='paused'&&<Button primary disabled={busy} onClick={()=>onAction(item.user_id,'restore')}>Restore access</Button>}</div></article>
 return <section className="bc-card bc-admin-applications"><div className="bc-row"><h2>Upper year applications</h2>{pending.length>0&&<span className="bc-pill">{pending.length} pending</span>}</div><p>Only approved upper year participants can view first year requests or offer help.</p>{pending.length?<div className="bc-application-list">{pending.map(row)}</div>:<p className="bc-muted">No applications waiting for review.</p>}{others.length>0&&<details><summary>Approved and previous applications · {others.length}</summary><div className="bc-application-list">{others.map(row)}</div></details>}</section>
}

export default function BuddyChoiceProgram({onBack,onOpenChat,registerNavigationGuard}) {
 const [programs,setPrograms]=useState([]),[program,setProgram]=useState(null),[data,setData]=useState(null)
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [view,setView]=useState('new'),[filter,setFilter]=useState('All'),[preview,setPreview]=useState(null),[joinRole,setJoinRole]=useState('')
 const [applyHelp,setApplyHelp]=useState([]),[applyFocus,setApplyFocus]=useState([])
 const [mentorEmail,setMentorEmail]=useState(''),[editingMentor,setEditingMentor]=useState(false)
 const [interestPosts,setInterestPosts]=useState([])
 const [retry,setRetry]=useState(0),[formKey,setFormKey]=useState(0),[assignedRefreshKey,setAssignedRefreshKey]=useState(0)
 const root=useRef(null),dirty=useRef(false),working=useRef(false),yearReturn=useRef('buddies')
 const setAssignedDirty=useCallback(value=>{dirty.current=value},[])
 useEffect(()=>registerNavigationGuard?.(proceed=>{if(!dirty.current||window.confirm(LEAVE_PROMPT))proceed()}),[registerNavigationGuard])
 useLayoutEffect(()=>{
  // scrollTo may return a Promise; effects must return only a cleanup function.
  root.current?.closest('.phone-scroll')?.scrollTo({top:0})
 },[view,program])
 useEffect(()=>{
  const application=data?.upper_application
  if(application&&!data?.role){
   setJoinRole('upper')
   setApplyHelp(application.help_topics||[])
   setApplyFocus(application.career_focus||[])
  }
  const firstRequest=data?.first_year_access
  if(firstRequest&&!data?.role&&!editingMentor){
   setJoinRole('first')
   setMentorEmail(firstRequest.mentor_email||'')
  }
 },[data?.upper_application,data?.first_year_access,data?.role,editingMentor])
 async function loadProgramState(p){
  const next=await buddyRpc('buddy_choice_state',{p_program:p})
  try{
   const links=await buddyRpc('buddy_choice_connection_links',{p_program:p})
   const byInvite=new Map((links||[]).map(link=>[link.invite_id,link.match_id]))
   next.invitations=(next.invitations||[]).map(invite=>({...invite,match_id:byInvite.get(invite.id)||invite.match_id||null}))
  }catch{/* New migration may still be propagating through the schema cache. */}
  try{
   const access=await buddyRpc('buddy_first_year_access_state',{p_program:p})
   next.first_year_access=access?.request||null
   next.mentee_verifications=access?.incoming||[]
  }catch{/* Other Buddy features remain usable until the verification migration is run. */}
  return next
 }
 async function refresh(p=program){const next=await loadProgramState(p);setData(next);return next}
 useEffect(()=>{let mounted=true;setLoading(true);setError('');buddyRpc('buddy_choice_state').then(async result=>{
  if(!mounted)return;setPrograms(result.programs||[])
  if(result.programs?.length===1){const id=result.programs[0].id;const next=await loadProgramState(id);if(mounted){setProgram(id);setData(next);setView(next.role?'buddies':next.coordinator?'access':'new')}}
 }).catch(e=>{if(mounted)setError(/buddy_choice|schema cache|function/i.test(e.message)?'The new Buddy Program is waiting for its database update. Please ask the program coordinator to finish setup.':e.message)}).finally(()=>{if(mounted)setLoading(false)});return()=>{mounted=false}},[retry])
 async function run(task,message){if(working.current)return;working.current=true;setBusy(true);setError('');try{await task();await refresh();setPreview(null);if(message)setNotice(message);return true}catch(e){setError(e.message);return false}finally{working.current=false;setBusy(false)}}
 function navigate(next){if(working.current)return false;if(dirty.current&&!window.confirm(LEAVE_PROMPT))return;dirty.current=false;setView(next);return true}
 function editYear(){if(navigate('year')){yearReturn.current=view;setJoinRole(data.role);setError('');setNotice('')}}
 function cancelYear(){if(navigate(yearReturn.current)){setJoinRole(data.role);setError('')}}
 async function saveYear(){
  if(!joinRole||joinRole===data.role)return
  if(joinRole==='upper'){
   const ok=await run(()=>buddyRpc('buddy_upper_apply',{p_program:program,p_help:applyHelp,p_focus:applyFocus}),'Application submitted. A program admin will review it before upper year access opens.')
   if(ok)setView('new')
   return
  }
  setError('First year access is verified by your assigned upper year Buddy. Ask the program admin to correct your year if needed.')
 }
 async function requestFirstYearAccess(){
  const email=mentorEmail.trim().toLowerCase()
  if(!email)return
  const ok=await run(()=>buddyRpc('buddy_first_year_request',{p_program:program,p_mentor_email:email}),'Request sent. Your assigned Buddy can now verify your access.')
  if(ok){setEditingMentor(false);setJoinRole('first')}
 }
 async function checkFirstYearAccess(){
  setBusy(true);setError('')
  try{
   const next=await refresh()
   if(next.role==='first'){setEditingMentor(false);setView('buddies');setAssignedRefreshKey(k=>k+1)}
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function verifyMentee(id,accept){
  const ok=await run(()=>buddyRpc('buddy_first_year_verify',{p_request:id,p_accept:accept}),accept?'Buddy verified. Their first year access is now open.':'Verification was not confirmed. The student can update their Buddy email.')
  if(ok)setAssignedRefreshKey(k=>k+1)
 }
 async function join(){
  if(!joinRole)return
  if(joinRole==='upper'){
   const ok=await run(()=>buddyRpc('buddy_upper_apply',{p_program:program,p_help:applyHelp,p_focus:applyFocus}),'Application submitted. A program admin will review it before upper year access opens.')
   if(ok)setView('new')
   return
  }
  await requestFirstYearAccess()
 }
 const role=data?.role,upper=role==='upper'
 const posts=(data?.posts||[]).filter(p=>upper?(filter==='All'||p.helpType?.includes(filter))&&(view!=='selected'||data.invitations.some(i=>i.post_id===p.id&&['pending','accepted'].includes(i.status))):p.owner==='me')
 const used=(data?.invitations||[]).filter(i=>['pending','accepted'].includes(i.status)).length
 function actions(post){
  const invites=(data.invitations||[]).filter(i=>i.post_id===post.id)
  const acceptedInvite=invites.find(i=>i.status==='accepted')
  const visibleInvites=acceptedInvite?[acceptedInvite]:invites.filter(i=>i.status!=='withdrawn')
  const expired=postIsExpired(post),accepted=Boolean(acceptedInvite)
  return <div className="bc-actions">
   {!upper&&expired&&!accepted&&<div className="bc-expired-state" role="status"><strong>Expired</strong><span>Upper year students cannot see this post right now.</span><Button primary disabled={busy||!data.enabled} onClick={()=>run(()=>buddyRpc('buddy_choice_renew_post',{p_post:post.id,p_days:7}),'Post renewed for 7 days. Upper year students can see it again.')}>Renew for 7 days</Button></div>}
   {visibleInvites.map(i=><div key={i.id}>{i.status==='accepted'?<button type="button" className="bc-connected-person" disabled={!i.match_id} onClick={()=>i.match_id&&onOpenChat?.(i.match_id)}><PeerAvatar name={i.name||'Connected student'} seed={i.match_id||i.id} size={38}/><span><strong>{i.name||'Connected student'}</strong><small>Connected through this request</small></span><b>{i.match_id?'Message →':'Connected'}</b></button>:i.status==='pending'?upper?<span>Waiting for student confirmation</span>:<div className="bc-invite"><strong>An upper-year student would like to help with this request.</strong><p>Connect to share your names with each other and start chatting.</p><Button primary disabled={busy} onClick={()=>run(()=>buddyRpc('buddy_choice_connect',{p_invite:i.id}),'Connected. You can now message each other in Matches.')}>Connect</Button><Button disabled={busy} onClick={()=>run(()=>buddyRpc('buddy_choice_respond',{p_invite:i.id,p_action:'decline'}),'Help offer declined.')}>Decline</Button></div>:i.status==='declined'?<small>Help offer declined</small>:null}
    {upper&&i.status==='pending'&&<Button disabled={busy} onClick={()=>run(()=>buddyRpc('buddy_choice_respond',{p_invite:i.id,p_action:'withdraw'}),'Help offer withdrawn.')}>Withdraw offer</Button>}
   </div>)}
   {upper&&!invites.some(i=>['pending','accepted','declined'].includes(i.status))&&<Button primary disabled={busy||used>=data.capacity||!data.enabled} onClick={()=>run(()=>buddyRpc('buddy_choice_select',{p_post:post.id}),'Help offered. The first-year student can connect or decline.')}>I’d like to help</Button>}
   {!upper&&<Button disabled={busy} onClick={()=>{if(window.confirm('Remove this post? Existing connections will stay in Matches.'))run(()=>buddyRpc('buddy_choice_remove',{p_post:post.id}),'Post removed.')}}>Remove post</Button>}
  </div>
 }
 return <AppScreen background="transparent"><main className="bc-shell bc-program" ref={root}>
 <header className="bc-program-header"><Button className="bc-back" disabled={busy} onClick={()=>{if(view==='year'){cancelYear();return}if(!dirty.current||window.confirm(LEAVE_PROMPT))onBack()}}>{view==='year'?'‹ Back':'‹ Together'}</Button><h1>Buddy Program</h1><p>{upper?'Your crew. A little help, together.':role==='first'?'A little help goes a long way.':'Ask for support or share what you have learned.'}</p></header>
 {error&&<section className="bc-card" role="alert"><p>{error}</p><Button disabled={busy} onClick={()=>{if(program)run(()=>Promise.resolve());else setRetry(r=>r+1)}}>Try again</Button></section>}
 {notice&&<p className="bc-notice" role="status">{notice}</p>}
 {loading?<p role="status">Opening Buddy Program…</p>:!data?<section className="bc-card"><h2>Support that goes both ways</h2><p>First year students share what they need and can offer. Approved upper year Buddy Program participants can choose where to help.</p>{programs.length?programs.map(p=><Button key={p.id} onClick={async()=>{setLoading(true);try{const next=await refresh(p.id);setProgram(p.id);setView(next.role?'buddies':next.coordinator?'access':'new')}catch(e){setError(e.message)}finally{setLoading(false)}}}>{p.name}</Button>):!error&&<p>Join your student community to access its Buddy Program.</p>}</section>:<>
 {role&&view!=='year'&&<div className="bc-year-setting"><span>{upper?'Second year / upper year':'First year'}</span><Button disabled={busy} onClick={editYear}>Change year</Button></div>}
 {(role||data.coordinator)&&view!=='year'&&<nav className="bc-tabs" aria-label="Buddy views">{(upper?[['buddies','My Buddies'],['browse','Community'],['selected','My selections']]:role==='first'?[['buddies','My Buddy'],['home','Community'],['mine','My posts']]:[]).concat(data.coordinator?[['access','Manage access']]:[]).map(([id,label])=><Button key={id} aria-pressed={view===id} onClick={()=>navigate(id)}>{label}</Button>)}</nav>}
 {role==='first'&&view==='home'&&<section className="bc-intro"><span className="bc-eyebrow">A little support goes a long way</span><h2>A little help finding your footing</h2><p>Ask the community for another perspective.</p><Button primary disabled={!data.enabled} onClick={()=>navigate('new')}>Post a request →</Button>{!data.enabled&&<p className="bc-paused">Posting is paused by the program coordinator.</p>}</section>}
 {upper&&view==='browse'&&<section className="bc-intro"><span className="bc-eyebrow">You choose where to help</span><h2>Support a first-year your way</h2><p>Offer help where your experience is useful.</p><span className="bc-capacity">{used} of {data.capacity} help spots in use</span>{used>=data.capacity&&<p className="bc-paused">Your help spots are full. Manage your current offers in My selections.</p>}{!data.enabled&&<p className="bc-paused">New invitations are paused by the program coordinator.</p>}</section>}
 {role==='first'&&view==='mine'&&<div className="bc-toolbar"><h2>My buddy posts</h2><Button primary disabled={!data.enabled} onClick={()=>navigate('new')}>+ New post</Button></div>}
 {view==='buddies'&&role?<><MentorVerificationQueue items={upper?(data.mentee_verifications||[]):[]} busy={busy} onAction={verifyMentee}/><BuddyAssigned key={assignedRefreshKey} program={program} role={role} onDirtyChange={setAssignedDirty} coordinator={data.coordinator}/></>:view==='access'&&data.coordinator?<><AdminApplications items={data.upper_applications||[]} busy={busy} onAction={(userId,action)=>run(()=>buddyRpc('buddy_upper_application_decide',{p_program:program,p_user:userId,p_action:action}),action==='approve'?'Application approved.':action==='decline'?'Application declined.':action==='pause'?'Upper year access paused.':'Upper year access restored.')} />{!role&&<Button onClick={()=>navigate('new')}>Student access</Button>}</>
 :(!role||view==='year')?(!role&&data.upper_application?<UpperApplicationGate application={data.upper_application} busy={busy} enabled={data.enabled} help={applyHelp} focus={applyFocus} onHelp={setApplyHelp} onFocus={setApplyFocus} onResubmit={()=>run(()=>buddyRpc('buddy_upper_apply',{p_program:program,p_help:applyHelp,p_focus:applyFocus}),'Application submitted. A program admin will review it before upper year access opens.')} onRefresh={()=>refresh()}/>:!role&&data.first_year_access&&!editingMentor?<FirstYearAccessGate request={data.first_year_access} busy={busy} mentorEmail={mentorEmail} onMentorEmail={setMentorEmail} onRequest={requestFirstYearAccess} onRefresh={checkFirstYearAccess} onEdit={()=>setEditingMentor(true)} editing={false}/>:<section className="bc-card bc-join"><h2>{role?'Change your year':'How would you like to take part?'}</h2><p>{role?'Picked the wrong year? You can choose again.':'Choose your year. Find your crew.'}</p><fieldset className="bc-role-options" disabled={busy}><legend>Your year</legend><label><input type="radio" name="buddy-year" value="upper" checked={joinRole==='upper'} onChange={()=>setJoinRole('upper')}/><span><strong>I am a second year or upper year student</strong><small>Apply to help. A program admin approves access before first year requests become visible.</small></span></label><label><input type="radio" name="buddy-year" value="first" checked={joinRole==='first'} onChange={()=>setJoinRole('first')}/><span><strong>I am a first year student</strong><small>Share what you need and what you enjoy helping with.</small></span></label></fieldset>{joinRole==='first'&&<FirstYearAccessGate request={data.first_year_access} busy={busy} mentorEmail={mentorEmail} onMentorEmail={setMentorEmail} onRequest={requestFirstYearAccess} onRefresh={()=>{setEditingMentor(false);setMentorEmail(data.first_year_access?.mentor_email||'')}} onEdit={()=>setEditingMentor(true)} editing={true}/>} {joinRole==='upper'&&<div className="bc-upper-application"><h3>Help preferences</h3><p>Tell the program what you can help with. These become your starting preferences after approval.</p><ChoiceChips legend="Help topics" options={HELP_TYPES} value={applyHelp} onChange={setApplyHelp} max={3} disabled={busy}/><ChoiceChips legend="Career focus" options={CAREER_FOCUS_OPTIONS} value={applyFocus} onChange={setApplyFocus} max={2} disabled={busy}/><p className="bc-audience">Your application is visible only to program admins. First year students do not see your identity before you choose to help and they connect.</p></div>}<p className="bc-audience">My Buddies uses real names. School pairings stay separate from community help.</p>{joinRole!=='first'&&<Button primary disabled={busy||!joinRole||!data.enabled||(joinRole==='upper'&&!applyHelp.length)||(!!role&&joinRole===role)} onClick={role?saveYear:join}>{busy?'Saving…':joinRole==='upper'?'Submit application':'Join Buddy Program'}</Button>}{role&&<Button disabled={busy} onClick={cancelYear}>Cancel</Button>}{!data.enabled&&<p>Joining is paused by the program coordinator.</p>}</section>)
 :role==='first'&&view==='new'?<><p className="bc-audience">Visible to upper year students in your community.</p>{!data.enabled?<p>Posting is paused by the program coordinator.</p>:<div onChangeCapture={()=>{dirty.current=true}} onClickCapture={e=>{if(e.target.closest('button'))dirty.current=true}}><SubmitRequest key={formKey} audience="Approved upper year students in your community" onSubmitted={async payload=>{const ok=await run(()=>buddyRpc('buddy_choice_publish',{p_program:program,p_post:payload}),'Post published. Upper-year students can now choose to help.');if(!ok)return {error:{message:'Your post was not published. Please try again.'}};dirty.current=false;setFormKey(k=>k+1);setView('mine');return {}}}/></div>}</>
 :<>{upper&&<UpperBuddyProfile program={program} onInterestPosts={setInterestPosts}/ >}{upper&&<div className="bc-filter"><label>Help type<select aria-label="Filter by help type" value={filter} onChange={e=>setFilter(e.target.value)}>{['All',...HELP_TYPES].map(t=><option key={t}>{t}</option>)}</select></label><p>Choose a student whose request you can help with.</p></div>}
 {view!=='mine'&&<div className="bc-section-heading"><h2>{upper?(view==='selected'?'My selections':'First-year requests'):'Your requests'}</h2><span>{posts.length} {posts.length===1?'post':'posts'}</span></div>}
 <div className="bc-list">{posts.length?posts.map(post=><article className="bc-card" key={post.id}>{upper&&interestPosts.includes(post.id)&&<p className="br-interest-badge">This student is interested in connecting with you.</p>}{!upper&&postIsExpired(post)&&<span className="bc-expired-badge">Expired</span>}<button className="bc-open" onClick={()=>setPreview(post)} aria-label="Preview full post"><Post post={post}/><span className="bc-preview-link">View full post ↗</span></button>{actions(post)}</article>):<section className="bc-card bc-empty"><h2>{view==='selected'?'No selections yet':upper&&filter!=='All'?'No requests for this help type':'No posts here yet'}</h2><p>{upper?(view==='selected'?'Browse requests to find a student you can support.':filter!=='All'?'Try another help type to see more requests.':'New first-year posts will appear here.'):'Your request is a starting point for a useful conversation. Share what would help right now.'}</p>{upper&&view==='selected'&&<Button onClick={()=>navigate('browse')}>Browse posts</Button>}</section>}</div></>}
 {role==='first'&&view==='home'&&<BuddyRecommendations program={program} posts={data.posts||[]} version={data}/>}
 </>}
 {preview&&<Preview post={preview} onClose={()=>setPreview(null)}>{actions(preview)}</Preview>}
 </main></AppScreen>
}
