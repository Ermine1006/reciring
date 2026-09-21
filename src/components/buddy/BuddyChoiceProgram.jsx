import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import AppScreen from '../AppScreen'
import BuddyAssigned from './BuddyAssigned'
import SubmitRequest from '../SubmitRequest'
import { HELP_TYPES } from '../../data/requestOptions'
import { buddyRpc } from '../../lib/buddy/api'
import { Button, Post, Preview } from './BuddyChoiceDemo'
import './choice-demo.css'
import './choice-program.css'
import BuddyRecommendations, { UpperBuddyProfile } from './BuddyRecommendations'

export default function BuddyChoiceProgram({onBack,registerNavigationGuard}) {
 const [programs,setPrograms]=useState([]),[program,setProgram]=useState(null),[data,setData]=useState(null)
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [view,setView]=useState('new'),[filter,setFilter]=useState('All'),[preview,setPreview]=useState(null),[email,setEmail]=useState(''),[joinRole,setJoinRole]=useState('')
 const [interestPosts,setInterestPosts]=useState([])
 const [retry,setRetry]=useState(0),[formKey,setFormKey]=useState(0)
 const root=useRef(null),dirty=useRef(false),working=useRef(false),yearReturn=useRef('buddies')
 const setAssignedDirty=useCallback(value=>{dirty.current=value},[])
 useEffect(()=>registerNavigationGuard?.(proceed=>{if(!dirty.current||window.confirm('Leave without sending your changes?'))proceed()}),[registerNavigationGuard])
 useLayoutEffect(()=>{
  // scrollTo may return a Promise; effects must return only a cleanup function.
  root.current?.closest('.phone-scroll')?.scrollTo({top:0})
 },[view,program])
 async function refresh(p=program){const next=await buddyRpc('buddy_choice_state',{p_program:p});setData(next);return next}
 useEffect(()=>{let mounted=true;setLoading(true);setError('');buddyRpc('buddy_choice_state').then(async result=>{
  if(!mounted)return;setPrograms(result.programs||[])
  if(result.programs?.length===1){const id=result.programs[0].id;const next=await buddyRpc('buddy_choice_state',{p_program:id});if(mounted){setProgram(id);setData(next);setView(next.role?'buddies':next.coordinator?'access':'new')}}
 }).catch(e=>{if(mounted)setError(/buddy_choice|schema cache|function/i.test(e.message)?'The new Buddy Program is waiting for its database update. Please ask the program coordinator to finish setup.':e.message)}).finally(()=>{if(mounted)setLoading(false)});return()=>{mounted=false}},[retry])
 async function run(task,message){if(working.current)return;working.current=true;setBusy(true);setError('');try{await task();await refresh();setPreview(null);if(message)setNotice(message);return true}catch(e){setError(e.message);return false}finally{working.current=false;setBusy(false)}}
 function navigate(next){if(working.current)return false;if(dirty.current&&!window.confirm('Leave without sending your changes?'))return;dirty.current=false;setView(next);return true}
 function editYear(){if(navigate('year')){yearReturn.current=view;setJoinRole(data.role);setError('');setNotice('')}}
 function cancelYear(){if(navigate(yearReturn.current)){setJoinRole(data.role);setError('')}}
 async function saveYear(){
  if(!joinRole||joinRole===data.role)return
  const ok=await run(async()=>{
   try{await buddyRpc('buddy_choice_change_year',{p_program:program,p_role:joinRole})}
   catch(e){if(/buddy_choice_change_year|schema cache/i.test(e.message))throw new Error('Year changes are waiting for a program update. Your current year is unchanged.');throw e}
  },'Your year is updated.')
  if(ok){setFilter('All');setInterestPosts([]);setView('buddies')}
 }
 async function join(){
  if(!joinRole)return
  const ok=await run(async()=>{
   try{await buddyRpc(joinRole==='upper'?'buddy_choice_join_upper':'buddy_choice_join',{p_program:program})}
   catch(e){if(joinRole==='upper'&&/buddy_choice_join_upper|schema cache/i.test(e.message))throw new Error('Open signup is waiting for a program update. Please try again once setup is complete.');throw e}
  },joinRole==='upper'?'Welcome. Choose a request where you can help.':'You can now create your first post.')
  if(ok)setView('buddies')
 }
 const role=data?.role,upper=role==='upper'
 const posts=(data?.posts||[]).filter(p=>upper?(filter==='All'||p.helpType?.includes(filter))&&(view!=='selected'||data.invitations.some(i=>i.post_id===p.id&&['pending','accepted'].includes(i.status))):p.owner==='me')
 const used=(data?.invitations||[]).filter(i=>['pending','accepted'].includes(i.status)).length
 function actions(post){const invites=(data.invitations||[]).filter(i=>i.post_id===post.id);return <div className="bc-actions">
  {invites.map(i=><div key={i.id}>{i.status==='accepted'?<p className="bc-success">Connected with {i.name||'your buddy'}. You have both agreed to connect.</p>:i.status==='pending'?upper?<span>Waiting for student confirmation</span>:<div className="bc-invite"><strong>An upper-year buddy would like to support you.</strong><p>Accept to share your names with each other.</p><Button primary disabled={busy} onClick={()=>run(()=>buddyRpc('buddy_choice_respond',{p_invite:i.id,p_action:'accept'}),'Buddy invitation accepted.')}>Accept buddy</Button><Button disabled={busy} onClick={()=>run(()=>buddyRpc('buddy_choice_respond',{p_invite:i.id,p_action:'decline'}),'Invitation declined.')}>Decline</Button></div>:<small>{i.status==='declined'?'Invitation declined':'Invitation withdrawn'}</small>}
   {upper&&['pending','accepted'].includes(i.status)&&<Button disabled={busy} onClick={()=>run(()=>buddyRpc('buddy_choice_respond',{p_invite:i.id,p_action:'withdraw'}),'Invitation withdrawn.')}>{i.status==='accepted'?'End connection':'Withdraw invitation'}</Button>}
  </div>)}
  {upper&&!invites.some(i=>['pending','accepted','declined'].includes(i.status))&&<Button primary disabled={busy||used>=data.capacity||!data.enabled} onClick={()=>run(()=>buddyRpc('buddy_choice_select',{p_post:post.id}),'Invitation sent. The first-year student can accept or decline.')}>I’d like to be your buddy</Button>}
  {!upper&&<Button disabled={busy} onClick={()=>{if(window.confirm('Remove this post and end its buddy invitations?'))run(()=>buddyRpc('buddy_choice_remove',{p_post:post.id}),'Post removed.')}}>Remove post</Button>}
 </div>}
 return <AppScreen background="transparent"><main className="bc-shell bc-program" ref={root}>
 <header className="bc-program-header"><Button className="bc-back" disabled={busy} onClick={()=>{if(view==='year'){cancelYear();return}if(!dirty.current||window.confirm('Leave without sending your changes?'))onBack()}}>{view==='year'?'‹ Back':'‹ Together'}</Button><h1>Buddy Program</h1><p>{upper?'Your crew. A little help, together.':role==='first'?'A little help goes a long way.':'Ask for support or share what you have learned.'}</p></header>
 {error&&<section className="bc-card" role="alert"><p>{error}</p><Button disabled={busy} onClick={()=>{if(program)run(()=>Promise.resolve());else setRetry(r=>r+1)}}>Try again</Button></section>}
 {notice&&<p className="bc-notice" role="status">{notice}</p>}
 {loading?<p role="status">Opening Buddy Program…</p>:!data?<section className="bc-card"><h2>Support that goes both ways</h2><p>First year students share what they need and can offer. All upper year students in the community can join to help.</p>{programs.length?programs.map(p=><Button key={p.id} onClick={async()=>{setLoading(true);try{const next=await refresh(p.id);setProgram(p.id);setView(next.role?'buddies':next.coordinator?'access':'new')}catch(e){setError(e.message)}finally{setLoading(false)}}}>{p.name}</Button>):!error&&<p>Join your student community to access its Buddy Program.</p>}</section>:<>
 {role&&view!=='year'&&<div className="bc-year-setting"><span>{upper?'Second year / upper year':'First year'}</span><Button disabled={busy} onClick={editYear}>Change year</Button></div>}
 {(role||data.coordinator)&&view!=='year'&&<nav className="bc-tabs" aria-label="Buddy views">{(upper?[['buddies','My Buddies'],['browse','Community'],['selected','My selections']]:role==='first'?[['buddies','My Buddy'],['home','Community'],['mine','My posts']]:[]).concat(data.coordinator?[['access','Manage access']]:[]).map(([id,label])=><Button key={id} aria-pressed={view===id} onClick={()=>navigate(id)}>{label}</Button>)}</nav>}
 {role==='first'&&view==='home'&&<section className="bc-intro"><span className="bc-eyebrow">A little support goes a long way</span><h2>A little help finding your footing</h2><p>Ask the community for another perspective.</p><Button primary disabled={!data.enabled} onClick={()=>navigate('new')}>Post a request →</Button>{!data.enabled&&<p className="bc-paused">Posting is paused by the program coordinator.</p>}</section>}
 {upper&&view==='browse'&&<section className="bc-intro"><span className="bc-eyebrow">You choose where to help</span><h2>Support a first-year your way</h2><p>Share a little experience beyond your own Buddy crew.</p><span className="bc-capacity">{used} of {data.capacity} buddy places in use</span>{used>=data.capacity&&<p className="bc-paused">Your buddy places are full. You can manage invitations in My selections.</p>}{!data.enabled&&<p className="bc-paused">New invitations are paused by the program coordinator.</p>}</section>}
 {role==='first'&&view==='mine'&&<div className="bc-toolbar"><h2>My buddy posts</h2><Button primary disabled={!data.enabled} onClick={()=>navigate('new')}>+ New post</Button></div>}
 {view==='buddies'&&role?<BuddyAssigned program={program} role={role} onDirtyChange={setAssignedDirty} coordinator={data.coordinator}/>:view==='access'&&data.coordinator?<section className="bc-card"><h2>Buddy participation</h2><p>Upper year students can join directly. Use these controls only to help with account access or pause participation when needed.</p><form onSubmit={e=>{e.preventDefault();run(()=>buddyRpc('buddy_choice_access',{p_program:program,p_email:email,p_active:true}),'Participation enabled.')}}><label className="bc-access">Registered email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="student@example.com"/></label><button className="bc-button" type="submit" disabled={busy}>Enable participation</button><Button disabled={busy||!email.trim()} onClick={()=>run(()=>buddyRpc('buddy_choice_access',{p_program:program,p_email:email,p_active:false}),'Participation paused. Active invitations have ended.')}>Pause participation</Button></form><div className="bc-access">{data.upper_students.map(s=><p key={s.id}>{s.name} · {s.active?'Participating':'Paused'}</p>)}</div><p>Students declare their own year. Joining does not require coordinator approval.</p>{!role&&<Button onClick={()=>navigate('new')}>Join as a student</Button>}</section>
 :(!role||view==='year')?<section className="bc-card bc-join"><h2>{role?'Change your year':'How would you like to take part?'}</h2><p>{role?'Picked the wrong year? You can choose again.':'Choose your year. Find your crew.'}</p><fieldset className="bc-role-options" disabled={busy}><legend>Your year</legend><label><input type="radio" name="buddy-year" value="upper" checked={joinRole==='upper'} onChange={()=>setJoinRole('upper')}/><span><strong>I am a second year or upper year student</strong><small>Browse requests and choose where to help. No approval needed.</small></span></label><label><input type="radio" name="buddy-year" value="first" checked={joinRole==='first'} onChange={()=>setJoinRole('first')}/><span><strong>I am a first year student</strong><small>Share what you need and what you enjoy helping with.</small></span></label></fieldset><p className="bc-audience">My Buddies uses real names. School pairings stay separate from community help.</p><Button primary disabled={busy||!joinRole||!data.enabled||(!!role&&joinRole===role)} onClick={role?saveYear:join}>{role?(busy?'Saving…':'Save year'):busy?'Joining…':joinRole==='upper'?'Join as a mentor':joinRole==='first'?'Join as a student':'Join Buddy Program'}</Button>{role&&<Button disabled={busy} onClick={cancelYear}>Cancel</Button>}{!data.enabled&&<p>Joining is paused by the program coordinator.</p>}</section>
 :role==='first'&&view==='new'?<><p className="bc-audience">Visible to upper year buddies in your community.</p>{!data.enabled?<p>Posting is paused by the program coordinator.</p>:<div onChangeCapture={()=>{dirty.current=true}} onClickCapture={e=>{if(e.target.closest('button'))dirty.current=true}}><SubmitRequest key={formKey} audience="Upper year buddies in your community" onSubmitted={async payload=>{const ok=await run(()=>buddyRpc('buddy_choice_publish',{p_program:program,p_post:payload}),'Post published. Upper-year buddies can now choose to help.');if(!ok)return {error:{message:'Your post was not published. Please try again.'}};dirty.current=false;setFormKey(k=>k+1);setView('mine');return {}}}/></div>}</>
 :<>{upper&&<UpperBuddyProfile program={program} onInterestPosts={setInterestPosts}/ >}{upper&&<div className="bc-filter"><label>Help type<select aria-label="Filter by help type" value={filter} onChange={e=>setFilter(e.target.value)}>{['All',...HELP_TYPES].map(t=><option key={t}>{t}</option>)}</select></label><p>Choose a student whose request you can help with.</p></div>}
 {view!=='mine'&&<div className="bc-section-heading"><h2>{upper?(view==='selected'?'My selections':'First-year requests'):'Your requests'}</h2><span>{posts.length} {posts.length===1?'post':'posts'}</span></div>}
 <div className="bc-list">{posts.length?posts.map(post=><article className="bc-card" key={post.id}>{upper&&interestPosts.includes(post.id)&&<p className="br-interest-badge">This student is interested in connecting with you.</p>}<button className="bc-open" onClick={()=>setPreview(post)} aria-label="Preview full post"><Post post={post}/><span className="bc-preview-link">View full post ↗</span></button>{actions(post)}</article>):<section className="bc-card bc-empty"><h2>{view==='selected'?'No selections yet':upper&&filter!=='All'?'No requests for this help type':'No posts here yet'}</h2><p>{upper?(view==='selected'?'Browse requests to find a student you can support.':filter!=='All'?'Try another help type to see more requests.':'New first-year posts will appear here.'):'Your request is a starting point for a useful conversation. Share what would help right now.'}</p>{upper&&view==='selected'&&<Button onClick={()=>navigate('browse')}>Browse posts</Button>}</section>}</div></>}
 {role==='first'&&view==='home'&&<BuddyRecommendations program={program} posts={data.posts||[]} version={data}/>}
 </>}
 {preview&&<Preview post={preview} onClose={()=>setPreview(null)}>{actions(preview)}</Preview>}
 </main></AppScreen>
}
