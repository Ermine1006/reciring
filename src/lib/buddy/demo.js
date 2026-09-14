export const sampleProgram = { id: 'sample', name: 'Rotman Buddy Program', enabled: true, coordinator: true, role: 'mentee' }
export function samplePost() {
  const start = new Date(Date.now() + 3 * 86400000); start.setHours(14, 0, 0, 0)
  return { need: 'I’m moving from engineering into finance. I’d love help with recruiting and settling into Toronto.', offer: 'Happy to share Python skills and AI tools for coursework.', experience: 'Engineering background. Interested in finance and AI.', need_topics: ['finance','recruiting','toronto_life'], offer_topics: ['coding','ai_tools'], profile_topics:['finance','technology'], windows:[{start:start.toISOString(),end:new Date(+start+3600000).toISOString()}], meeting_format:'either',capacity:1,contact:'student@example.test',consent:false }
}
export function samplePair(post) {
  if(post.role==='mentor'){const student=samplePost();const common=student.need_topics.filter(t=>post.offer_topics.includes(t));if(!common.length)return [];return [{id:'sample-pair',status:'suggested',you_accepted:false,you_met:false,both_met:false,common_topics:common,reciprocal_topics:student.offer_topics.filter(t=>post.need_topics.includes(t)),profile_topics:student.profile_topics.filter(t=>post.profile_topics.includes(t)),suggested_start:post.windows[0].start,expires_at:new Date(Date.now()+2*86400000).toISOString(),peer:{name:'Sample mentee',role:'mentee',need:student.need,offer:student.offer,experience:student.experience,meeting_format:'either',contact:null}}]}
  const common = post.need_topics.filter(t=>['finance','recruiting','toronto_life'].includes(t))
  if (!common.length) return []
  return [{id:'sample-pair',status:'suggested',you_accepted:false,you_met:false,both_met:false,common_topics:common,reciprocal_topics:post.offer_topics.filter(t=>['coding','ai_tools'].includes(t)),profile_topics:post.profile_topics.filter(t=>t==='finance'),suggested_start:post.windows[0].start,expires_at:new Date(Date.now()+2*86400000).toISOString(),peer:{name:'Sample mentor',role:'mentor',need:'Learn practical AI tools.',offer:'Happy to share my experience with finance recruiting and life in Toronto.',experience:'Upper-year MBA student with experience in finance recruiting.',meeting_format:'either',contact:null}}]
}
export const sampleDashboard = {
 stats:{confirmed:18,awaiting:6,met:12}, exceptions:[{post_id:'1',name:'Sample student A',reason:'No suitable mentor'},{post_id:'2',name:'Sample student B',reason:'No shared time'},{post_id:'3',name:'Sample student C',reason:'Rematch requested'}],
 roster:[{name:'Sample mentor',role:'mentor',posted:true,active:true},{name:'Sample student',role:'mentee',posted:true,active:true}],
 settings:{enabled:true,automatic:true,max_mentees:3,reply_days:5},
}
