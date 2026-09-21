import { useMemo, useRef, useState } from 'react'
import BuddyAssigned from './BuddyAssigned'
import './choice-demo.css'

// Isolated local demo. The injected RPC never calls production or writes sample records there.
const students=[
 {name:'Milan Patel',email:'milank.patel@rotman.utoronto.ca',body:'Recruiting or coursework? How did you balance both?'},
 {name:'Thomas Peng',email:'thomas.peng@rotman.utoronto.ca',body:'Could we practise my coffee chat introduction?'},
 {name:'Arza Sireen Ahmed',email:'arza.ahmed@rotman.utoronto.ca',body:'How did you find your people at Rotman?'}
]
const roster=students.map(s=>`${s.name} <${s.email}>`).join('\n')
export default function BuddyAssignedDemo({onBack}) {
 const [role,setRole]=useState('upper'),[student,setStudent]=useState(0),[version,setVersion]=useState(0)
 const pairs=useRef([]),counter=useRef(0)
 const rpc=useMemo(()=>async(name,args)=>{
  const me=role==='upper'?'Serene Lyu':students[student].name
  if(name==='buddy_assigned_add'){
   for(const s of args.p_students){if(!pairs.current.some(p=>p.email===s.email))pairs.current.push({id:`p${++counter.current}`,name:s.name||s.email,email:s.email,status:'pending',requests:[]})}
  }else if(name==='buddy_assigned_state')return {pairs:pairs.current.filter(p=>role==='upper'||p.email===students[student].email).map(p=>({...p,name:role==='upper'?p.name:'Serene Lyu',email:role==='upper'?p.email:null,requests:p.status==='confirmed'?p.requests.map(r=>({...r,replies:r.replies.map(a=>({...a,mine:a.name===me}))})):[]}))}
  else if(name==='buddy_assigned_confirm'){const p=pairs.current.find(p=>p.id===args.p_pair);if(role!=='first'||p.email!==students[student].email)throw Error('Switch to the assigned student to confirm.');p.status=args.p_accept?'confirmed':'declined'}
  else if(name==='buddy_assigned_ask'){const p=pairs.current.find(p=>p.id===args.p_pair);p.requests.unshift({id:`r${++counter.current}`,body:args.p_body,resolved:false,replied:false,replies:[]})}
  else if(name==='buddy_assigned_reply'){const r=pairs.current.flatMap(p=>p.requests).find(r=>r.id===args.p_request);r.replies.push({id:`a${++counter.current}`,body:args.p_body,name:me});if(role==='upper')r.replied=true}
  else if(name==='buddy_assigned_resolve'){pairs.current.flatMap(p=>p.requests).find(r=>r.id===args.p_request).resolved=args.p_resolved}
  else if(name==='buddy_assigned_summary'){const requests=pairs.current.flatMap(p=>p.requests);return {assigned:pairs.current.filter(p=>p.status==='confirmed').length,pending:pairs.current.filter(p=>p.status==='pending').length,requests:requests.length,answered:requests.filter(r=>r.replied).length,resolved:requests.filter(r=>r.resolved).length}}
  else throw Error('This action is outside the demo.')
  return null
 },[role,student])
 function sample(){pairs.current=students.map((s,i)=>({id:`sample${i}`,name:s.name,email:s.email,status:'confirmed',requests:[{id:`sample-r${i}`,body:s.body,resolved:false,replied:i===2,replies:i===2?[{id:'sample-reply',name:'Serene Lyu',body:'Try one small recurring activity. What do you enjoy outside class?'}]:[]}]}));setVersion(v=>v+1)}
 return <div className="ba-demo-page"><header className="ba-demo-brand">◎ Mutu</header><div className="ba-demo-controls"><strong>Demo only</strong><label>View <select aria-label="Demo perspective" value={role} onChange={e=>setRole(e.target.value)}><option value="upper">Mentor</option><option value="first">Student</option></select></label>{role==='first'&&<select aria-label="Demo student" value={student} onChange={e=>setStudent(Number(e.target.value))}>{students.map((s,i)=><option key={s.email} value={i}>{s.name}</option>)}</select>}<button className="bc-button" onClick={sample}>Load sample requests</button><button className="bc-button" onClick={()=>{pairs.current=[];setVersion(v=>v+1)}}>Start from adding</button></div><main><button className="bc-button" onClick={onBack}>‹ Together</button><h1>Buddy Program</h1><BuddyAssigned key={`${role}-${student}-${version}`} program="demo" role={role} rpc={rpc} initialRoster={roster} coordinator={role==='upper'}/></main><div className="ba-demo-note">Sample requests and replies. No emails or real account changes.</div><footer className="ba-demo-nav"><span>Home</span><span>Give &amp; Ask</span><strong>Together</strong><span>Matches</span></footer></div>
}
