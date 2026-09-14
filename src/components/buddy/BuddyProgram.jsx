import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import AppScreen from '../AppScreen'
import { useAuth } from '../../context/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import { matchaCta } from '../../lib/matchaCta'
import { buddyRpc, analyzeBuddyPost } from '../../lib/buddy/api'
import { BUDDY_TOPICS, cleanTopics, topicLabel } from '../../lib/buddy/topics'
import { sampleProgram, samplePost, samplePair, sampleDashboard } from '../../lib/buddy/demo'
import './buddy.css'

const dateLabel = value => new Date(value).toLocaleString([], { dateStyle:'medium',timeStyle:'short' })
const localDate = value => { if (!value) return ''; const d=new Date(value); return new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16) }
function Button({ children, primary=false, ...props }) { return <button type="button" className={primary?'buddy-primary':'buddy-button'} style={primary?matchaCta:undefined} {...props}>{children}</button> }
function Topics({ label, value, onChange }) {
 return <fieldset className="buddy-topics"><legend>{label} <small>Choose up to 8</small></legend><div>{BUDDY_TOPICS.map(t=><button type="button" key={t.key} aria-pressed={value.includes(t.key)} disabled={!value.includes(t.key)&&value.length>=8} onClick={()=>onChange(value.includes(t.key)?value.filter(x=>x!==t.key):[...value,t.key])}>{t.label}</button>)}</div></fieldset>
}
function PostContent({ post }) {
 return <><span className="buddy-label">Looking for</span><p className="buddy-copy">{post.need}</p>{post.offer&&<><span className="buddy-label buddy-offer">Also happy to help with</span><p className="buddy-copy">{post.offer}</p></>}</>
}
function PairCard({ pair, post, onAction, busy }) {
 return <article className="buddy-panel">
  <div className="buddy-row"><h2>{pair.status==='accepted'?pair.peer.name:'Your suggested buddy'}</h2><span className="buddy-pill">{pair.status==='accepted'?'Both accepted':'Automatically suggested'}</span></div>
  <div className="buddy-pair-posts"><section><h3>You · {post.role==='mentor'?'Mentor':'Mentee'}</h3><PostContent post={post}/></section><section><h3>{pair.peer.name}</h3><PostContent post={pair.peer}/>{pair.peer.experience&&<p className="buddy-muted">Relevant experience: {pair.peer.experience}</p>}</section></div>
  <section className="buddy-reasons"><h3>Why this pairing fits</h3>
   <p>{post.role==='mentor'?'Your support offer covers this student’s needs in':'This mentor offers support with your needs in'}: <strong>{pair.common_topics.map(topicLabel).join(', ')}</strong>.</p>
   {pair.reciprocal_topics.length>0&&<p>You can also support each other with {pair.reciprocal_topics.map(topicLabel).join(', ')}.</p>}
   {pair.profile_topics.length>0&&<p>Your shared experience topics include {pair.profile_topics.map(topicLabel).join(', ')}.</p>}
   <p>You shared an available 30-minute window: {dateLabel(pair.suggested_start)}. A mentor place is reserved while you decide.</p>
   <small>Based on the topics and experience each person shared. This is a suggested time, not a booked meeting.</small>
  </section>
  {pair.status==='suggested'?<>
   <p className="buddy-muted">Both people confirm before names and contact details are shared. Reply by {dateLabel(pair.expires_at)}.</p>
   {pair.you_accepted?<p role="status">You accepted. Waiting for your buddy.</p>:<Button primary disabled={busy} onClick={()=>onAction(pair.id,'accept')}>Accept pairing</Button>}
  </>:<>
   <div className="buddy-introduction"><h3>Your introduction is ready</h3><p>Reach out to {pair.peer.name} to agree on your first conversation.</p><p className="buddy-copy"><strong>Contact:</strong> {pair.peer.contact}</p><p>Suggested time: {dateLabel(pair.suggested_start)}</p></div>
   {pair.both_met?<p role="status">You both confirmed your first conversation. Thank you for connecting.</p>:pair.you_met?<p role="status">Your check-in is saved. Waiting for your buddy’s confirmation.</p>:<Button primary disabled={busy} onClick={()=>onAction(pair.id,'met')}>We had our first conversation</Button>}
  </>}
  <Button disabled={busy} onClick={()=>onAction(pair.id,'rematch')}>Request another match</Button>
 </article>
}
function Coordinator({ dashboard, onSettings, onAdd, busy, demo }) {
 const [settings,setSettings]=useState(dashboard.settings)
 const [emails,setEmails]=useState('')
 const [role,setRole]=useState('mentee')
 const [review,setReview]=useState(false)
 return <>
  <div className="buddy-row"><h1>Buddy Program overview</h1><span className="buddy-pill">Coordinator</span></div>
  <p>{settings.automatic?'Automatic matching is on':'Automatic matching is paused'}. No pair-by-pair approval is needed.</p>
  {demo&&<p className="buddy-demo">Sample program data. These are not real students or results.</p>}
  <div className="buddy-stats">{[[dashboard.stats.confirmed,'Confirmed'],[dashboard.stats.awaiting,'Awaiting reply'],[dashboard.exceptions.length,'Need support']].map(([n,label])=><div key={label}><strong>{n}</strong>{label}</div>)}</div>
  <div className="buddy-pair-posts"><section className="buddy-panel"><h2>Handled automatically</h2><p>✓ Pairing suggestions</p><p>✓ Introductions after acceptance</p><p>✓ In-app follow-up reminders</p>{!demo&&<small>Enable reminders during pilot setup.</small>}</section><section className="buddy-panel"><h2>Needs your attention</h2>{dashboard.exceptions.length===0?<p>No unmatched students need support right now.</p>:<>{[...new Set(dashboard.exceptions.map(e=>e.reason))].map(reason=><p key={reason}>{reason} <strong>{dashboard.exceptions.filter(e=>e.reason===reason).length}</strong></p>)}<Button primary onClick={()=>setReview(!review)}>Review {dashboard.exceptions.length} exceptions</Button></>}</section></div>
  {review&&<section className="buddy-panel"><h2>Support queue</h2>{dashboard.exceptions.map(e=><div key={e.post_id} className="buddy-exception"><strong>{e.name}</strong><p>{e.reason}</p><small>{e.reason==='No suitable mentor'?'Invite a mentor who can support this student’s needs.':e.reason==='No shared time'?'Ask the student to add more availability windows.':'Review mentor capacity and invite more support. The system will suggest a new eligible pairing when one becomes available.'}</small></div>)}</section>}
  <details className="buddy-panel"><summary>Program settings</summary><form onSubmit={e=>{e.preventDefault();onSettings(settings)}}>
   <label className="buddy-check"><input type="checkbox" checked={settings.enabled} onChange={e=>setSettings({...settings,enabled:e.target.checked})}/>Open for posting</label>
   <label className="buddy-check"><input type="checkbox" checked={settings.automatic} onChange={e=>setSettings({...settings,automatic:e.target.checked})}/>Automatic matching</label>
   <label>Maximum mentees per mentor<input type="number" min="1" max="10" value={settings.max_mentees} onChange={e=>setSettings({...settings,max_mentees:Number(e.target.value)})}/></label>
   <label>Days to respond<input type="number" min="2" max="30" value={settings.reply_days} onChange={e=>setSettings({...settings,reply_days:Number(e.target.value)})}/></label>
   <button className="buddy-primary" style={matchaCta} disabled={busy}>Save program settings</button>
  </form></details>
  <details className="buddy-panel"><summary>Program roster · {dashboard.roster.length} students</summary>
   <p>Add registered Rotman community members by email. They choose whether to post and participate.</p>
   <form onSubmit={async e=>{e.preventDefault();if(await onAdd(emails,role))setEmails('')}}>
    <label>Student emails<textarea required placeholder="One email per line" value={emails} onChange={e=>setEmails(e.target.value)}/></label>
    <label>Program role<select value={role} onChange={e=>setRole(e.target.value)}><option value="mentee">Mentee</option><option value="mentor">Mentor</option></select></label>
    <button className="buddy-primary" style={matchaCta} disabled={busy}>Add to roster</button>
   </form>
   {dashboard.roster.map((r,i)=><p key={i}>{r.name} · {r.role} · {r.active?'Participating':r.posted?'Paused':'Has not posted'}</p>)}
  </details>
  <p className="buddy-muted">Participation status only. Private chats stay private. {dashboard.stats.met} pairs have both confirmed their first conversation.</p>
 </>
}

export default function BuddyProgram({ onBack, registerNavigationGuard, forceDemo=false }) {
 const {profile}=useAuth()
 const rootRef=useRef(null)
 const [demo,setDemo]=useState(forceDemo||!isSupabaseConfigured)
 const [programs,setPrograms]=useState([])
 const [program,setProgram]=useState(null)
 const [data,setData]=useState({post:null,pairings:[],notices:[]})
 const [dashboard,setDashboard]=useState(null)
 const [view,setView]=useState('post')
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [dirty,setDirty]=useState(false)
 const [draft,setDraft]=useState(()=>(forceDemo||!isSupabaseConfigured)?samplePost():({...samplePost(),need:'',offer:'',experience:[profile?.headline,...(profile?.can_help_with||[])].filter(Boolean).join('. ').slice(0,1500),need_topics:[],offer_topics:[],profile_topics:[],windows:[{start:'',end:''}],contact:'',consent:false}))
 useLayoutEffect(()=>{rootRef.current?.closest('.phone-scroll')?.scrollTo({top:0})},[view,program?.id])
 const draftRef=useRef(false);draftRef.current=dirty
 useEffect(()=>registerNavigationGuard?.((proceed)=>{if(!draftRef.current||window.confirm('Leave without saving your buddy post?'))proceed()}), [registerNavigationGuard])
 const reload=useCallback(async(p=program)=>{
  if(!p)return
  const result=await buddyRpc('buddy_state',{p_program:p.id});setData(result)
  if(result.post&&!draftRef.current)setDraft({...result.post,consent:true})
  if(p.coordinator)setDashboard(await buddyRpc('buddy_dashboard',{p_program:p.id}))
  return result
 },[program])
 useEffect(()=>{
  let cancelled=false
  if(demo){setPrograms([sampleProgram]);setProgram(sampleProgram);setDashboard(sampleDashboard);setLoading(false);return}
  buddyRpc('buddy_state').then(r=>{if(!cancelled)setPrograms(r.programs||[])}).catch(()=>{if(!cancelled)setError('Buddy Program is not open for your account yet. You can explore the sample below.')}).finally(()=>{if(!cancelled)setLoading(false)})
  return()=>{cancelled=true}
 },[demo])
 const operation=useRef(false)
 const run=async action=>{if(operation.current)return;operation.current=true;setBusy(true);setError('');setNotice('');try{await action()}catch(e){setError(e.message)}finally{operation.current=false;setBusy(false)}}
 const change=(key,value)=>{setDirty(true);setDraft(d=>({...d,[key]:value}))}
 const choose=p=>run(async()=>{setProgram(p);if(!demo){const result=await reload(p);setView(result.post?'matches':'post')}})
 const openView=next=>{if(dirty&&!window.confirm('Leave without saving your buddy post?'))return;setDirty(false);setView(next)}
 const save=event=>{event.preventDefault();run(async()=>{
  if(!draft.consent)throw new Error('Please agree to share this post within the program.')
  if(program.role==='mentee'&&!draft.need_topics.length)throw new Error('Choose at least one need topic.')
  if(program.role==='mentor'&&(!draft.offer.trim()||!draft.offer_topics.length))throw new Error('Add the support you can offer and at least one offer topic.')
  if(draft.windows.some(w=>!w.start||!w.end||+new Date(w.start)<=Date.now()||+new Date(w.end)-+new Date(w.start)<1800000))throw new Error('Add future availability of at least 30 minutes.')
  if(demo){const post={...draft,role:program.role,id:'sample-post',active:true};setData({post,pairings:samplePair(post),notices:[]});setView('matches')}
  else{await buddyRpc('buddy_publish',{p_program:program.id,p_post:draft});await reload();setView('matches')}
  setDirty(false);setNotice('Post saved. Matching runs automatically.')
 })}
 const respond=(id,action)=>run(async()=>{
  if(action==='rematch'&&!window.confirm('Close this pairing and look for another buddy?'))return
  if(demo){setData(d=>({...d,pairings:action==='rematch'?[]:d.pairings.map(p=>p.id===id?{...p,you_accepted:action==='accept'||p.you_accepted,you_met:action==='met'||p.you_met}:p)}));return}
  await buddyRpc('buddy_respond',{p_pairing:id,p_action:action});await reload()
 })
 const analyze=()=>run(async()=>{
  if(demo){setDraft(d=>({...d,need_topics:['finance','recruiting','toronto_life'],offer_topics:['coding','ai_tools'],profile_topics:['finance','technology']}));setNotice('Example topic suggestions loaded. In the live program, AI reads your own text.');setDirty(true);return}
  const tags=await analyzeBuddyPost(draft.need,draft.offer,draft.experience)
  setDraft(d=>({...d,need_topics:cleanTopics(tags.need_topics),offer_topics:cleanTopics(tags.offer_topics),profile_topics:cleanTopics(tags.profile_topics)}));setDirty(true);setNotice('Review the suggested topics before posting. You can change any of them.')
 })
 const back=()=>{if(!dirty||window.confirm('Leave without saving your buddy post?'))onBack()}
 return <AppScreen><div className="buddy-root" ref={rootRef}>
  <header className="buddy-row"><Button onClick={back}>← Together</Button><strong><span style={{color:'#A6822A',fontFamily:'Georgia,serif'}}>Mutu</span> · Buddy Program</strong>{program&&!demo&&<Button disabled={busy||dirty} onClick={()=>run(()=>reload())}>Refresh</Button>}</header>
  {demo&&<div className="buddy-demo"><strong>Demo · Sample data only</strong><details className="buddy-demo-controls"><summary>Demo controls</summary><p>Nothing is published or sent.</p><Button onClick={()=>{setData({post:null,pairings:[],notices:[]});setDraft(samplePost());setProgram(sampleProgram);setDirty(false);setView('post')}}>Load sample post</Button>
   <label>Preview as<select aria-label="Preview role" value={program?.role||'mentee'} onChange={e=>{const role=e.target.value;const p=samplePost();setProgram({...sampleProgram,role});setDraft(role==='mentor'?{...p,need:'Learn practical AI tools.',offer:'Happy to share my experience with finance recruiting and life in Toronto.',need_topics:p.offer_topics,offer_topics:p.need_topics,capacity:3}:p);setData({post:null,pairings:[],notices:[]});setView('post');setDirty(false)}}><option value="mentee">Mentee</option><option value="mentor">Mentor</option></select></label></details></div>}
  {error&&<p role="alert" className="buddy-error">{error}</p>}{notice&&<p role="status" className="buddy-notice">{notice}</p>}
  {loading?<p role="status">Opening Buddy Program…</p>:!program?<section className="buddy-panel"><h1>Support for your next step</h1>{programs.length?programs.map(p=><Button key={p.id} onClick={()=>choose(p)}>{p.name}</Button>):<p>Your program coordinator will add you to the roster. Participation is optional.</p>}<Button onClick={()=>{setError('');setDemo(true)}}>Explore a sample</Button></section>:<>
   <div className="buddy-row buddy-tabs"><Button onClick={()=>openView('post')}>My buddy post</Button><Button onClick={()=>openView('matches')}>My buddy{data.pairings.length?` (${data.pairings.length})`:''}</Button>{program.coordinator&&dashboard&&<Button onClick={()=>openView('coordinator')}>Coordinator</Button>}</div>
   {view==='coordinator'&&program.coordinator&&dashboard?<Coordinator key={`${program.id}-${dashboard.settings.enabled}-${dashboard.settings.automatic}`} dashboard={dashboard} demo={demo} busy={busy}
    onSettings={settings=>run(async()=>{if(demo)setDashboard(d=>({...d,settings}));else{await buddyRpc('buddy_settings',{p_program:program.id,p_enabled:settings.enabled,p_automatic:settings.automatic,p_capacity:settings.max_mentees,p_reply_days:settings.reply_days});setProgram(p=>({...p,enabled:settings.enabled}));await reload()}setNotice('Program settings saved.')})}
    onAdd={async(emails,role)=>{let succeeded=false;await run(async()=>{if(demo){setNotice('Sample roster only. No students were added.');succeeded=true;return}const list=[...new Set(emails.split(/[\n,;]+/).map(e=>e.trim()).filter(Boolean))];if(list.length>100)throw new Error('Add up to 100 students at a time.');let added=0;for(const email of list){try{await buddyRpc('buddy_add_member',{p_program:program.id,p_email:email,p_role:role});added++}catch(e){throw new Error(`${added} entries processed. ${email}: ${e.message}`)}}await reload();setNotice(`${added} roster entries processed. Students still choose whether to participate.`);succeeded=true});return succeeded}}/>:
   view==='matches'?<>
    <h1>Support for your next step</h1>{data.notices.map(n=><p key={n.id} className="buddy-notice">{n.body}</p>)}
    {data.pairings.length?data.pairings.map(pair=><PairCard key={pair.id} pair={pair} post={data.post} busy={busy} onAction={respond}/>):<section className="buddy-panel"><h2>{data.post?.active?'Looking for the right support':'Share your buddy post'}</h2><p>{data.post?.active?'No eligible pairing is available yet. Matching checks needs, time, meeting preferences and mentor capacity. Your coordinator can see that you still need support.':'Tell the program what you need and how you would like to help.'}</p><Button primary onClick={()=>openView('post')}>{data.post?'Update my post':'Create my buddy post'}</Button></section>}
    {demo&&data.pairings.some(p=>p.you_accepted&&p.status==='suggested')&&<Button onClick={()=>setData(d=>({...d,pairings:d.pairings.map(p=>({...p,status:'accepted',peer:{...p.peer,name:d.post.role==='mentor'?'Jordan (sample)':'Alex (sample)',contact:'buddy@example.test'}}))}))}>Simulate buddy acceptance</Button>}
    {demo&&data.pairings.some(p=>p.you_met&&!p.both_met)&&<Button onClick={()=>setData(d=>({...d,pairings:d.pairings.map(p=>({...p,both_met:true}))}))}>Simulate buddy check-in</Button>}
   </>:<>
    <h1>{data.post?'My buddy post':'Create your buddy post'}</h1><p>Share what you need and what you can offer.</p>
    {!program.role?<p>Your coordinator account can manage this program. Ask to be added to the roster if you also want to participate.</p>:<form onSubmit={save}>
     <div className="buddy-pill">{program.role==='mentor'?'Mentor':'Mentee'} · {program.name}</div>
     <label className="buddy-label">Looking for<textarea required maxLength={2000} value={draft.need} onChange={e=>change('need',e.target.value)} placeholder="What would you like support with?"/></label>
     <label className="buddy-label buddy-offer">Also happy to help with {program.role==='mentee'&&<small>Optional</small>}<textarea required={program.role==='mentor'} maxLength={2000} value={draft.offer} onChange={e=>change('offer',e.target.value)} placeholder="What would you enjoy sharing?"/></label>
     <label>Relevant profile experience<textarea maxLength={1500} value={draft.experience} onChange={e=>change('experience',e.target.value)} placeholder="Relevant experience you would like to share"/></label>
     <details className="buddy-panel"><summary>Matching topics · Review before posting</summary><p className="buddy-muted">AI can suggest topics from the text and experience above. Only those fields are sent for analysis. Review or select topics yourself.</p><Button disabled={busy||!draft.need.trim()} onClick={analyze}>{busy?'Working…':'Suggest topics with AI'}</Button>
      <Topics label="I need help with" value={draft.need_topics} onChange={v=>change('need_topics',v)}/>
      <Topics label="I can help with" value={draft.offer_topics} onChange={v=>change('offer_topics',v)}/>
      <Topics label="My relevant experience" value={draft.profile_topics} onChange={v=>change('profile_topics',v)}/>
     </details>
     <fieldset><legend>Availability <small>{Intl.DateTimeFormat().resolvedOptions().timeZone}</small></legend><p className="buddy-muted">Add up to five future windows of at least 30 minutes. Times are saved with your timezone.</p>
      {draft.windows.map((w,i)=><div className="buddy-window" key={i}><label>From<input required type="datetime-local" value={localDate(w.start)} onChange={e=>change('windows',draft.windows.map((x,j)=>j===i?{...x,start:e.target.value?new Date(e.target.value).toISOString():''}:x))}/></label><label>Until<input required type="datetime-local" value={localDate(w.end)} onChange={e=>change('windows',draft.windows.map((x,j)=>j===i?{...x,end:e.target.value?new Date(e.target.value).toISOString():''}:x))}/></label>{draft.windows.length>1&&<Button onClick={()=>change('windows',draft.windows.filter((_,j)=>j!==i))}>Remove</Button>}</div>)}
      {draft.windows.length<5&&<Button onClick={()=>change('windows',[...draft.windows,{start:'',end:''}])}>Add a time window</Button>}
     </fieldset>
     <label>Meeting preference<select value={draft.meeting_format} onChange={e=>change('meeting_format',e.target.value)}><option value="either">Online or campus</option><option value="online">Online</option><option value="campus">On campus</option></select></label>
     {program.role==='mentor'&&<label>How many mentees can you support?<input type="number" min="1" max="10" value={draft.capacity} onChange={e=>change('capacity',Number(e.target.value))}/></label>}
     <label>How your buddy can reach you<input required maxLength={250} value={draft.contact} onChange={e=>change('contact',e.target.value)} placeholder="Email or preferred contact details"/><small>Shared only after both people accept.</small></label>
     <label className="buddy-check"><input type="checkbox" checked={draft.consent} onChange={e=>change('consent',e.target.checked)}/>I agree to share this post and relevant experience with potential buddies in this program, and my name and contact details after we both accept.</label>
     <p className="buddy-muted">Mentors volunteer their time. Offering help is optional for mentees. Participation is optional.</p>
     <button disabled={busy||!program.enabled} className="buddy-primary" style={matchaCta}>{busy?'Saving…':program.enabled?'Post & find my buddy':'Program is not open yet'}</button>
    </form>}
    {data.post?.active&&<Button disabled={busy} onClick={()=>run(async()=>{if(!window.confirm('Pause your buddy post and end current pairings?'))return;if(demo)setData({post:null,pairings:[],notices:[]});else{await buddyRpc('buddy_withdraw',{p_program:program.id});await reload()}setDirty(false);setNotice('Your participation is paused.')})}>Pause my participation</Button>}
   </>}
  </>}
 </div></AppScreen>
}
