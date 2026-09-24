import { useEffect, useState } from 'react'
import { fetchSkillRatingsSupport, fetchSessionSkillRatings } from '../../lib/practice'
import { feedbackSkills, RATING_ANCHORS } from '../../data/practiceSkillRatings'

export default function SessionSkillRatings({ session, myUserId }) {
  const [rows, setRows] = useState([])
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setRows([]); setFailed(false)
    if (session?.status !== 'verified') return
    fetchSkillRatingsSupport().then(async ({ supported }) => {
      if (!supported) return
      const { data, error } = await fetchSessionSkillRatings(session.id)
      if (active) { setRows(data || []); setFailed(Boolean(error)) }
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [session?.id, session?.status, attempt])
  const received = rows.find(row => row.recipient_user_id === myUserId)
  if (failed) return <p role="status">Could not load private ratings. <button type="button" onClick={() => setAttempt(n => n + 1)}>Try again</button></p>
  if (!received) return null
  return <section className="practice-paper">
    <h3>Your private skill feedback</h3>
    <p>From this session. Visible only to you and your partner.</p>
    {Object.entries(received.ratings).map(([skill, score]) => <p key={skill}>
      <strong>{feedbackSkills(session.interview_category).find(s => s.key === skill)?.label || skill}: {score}/5</strong><br />{RATING_ANCHORS[score - 1]}
    </p>)}
  </section>
}
