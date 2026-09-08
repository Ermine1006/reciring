import { Flower2 } from 'lucide-react'
import { STORY_REACTIONS } from '../../data/storiesContent'

export default function StoryWarmth({ story }) {
  if (!story.is_mine || !story.received_reactions?.length) return null
  const count = story.received_reader_count
  return <details className="g-pressed-flower">
    <summary><Flower2 size={30} strokeWidth={1.3} aria-hidden="true" /><span>Your words stayed with someone.<small>Unfold your pressed flower</small></span></summary>
    <p className="g-small">Only you can see this note.</p>
    {Number.isSafeInteger(count) && count > 0 && <p>{count === 1 ? '1 reader left a little warmth.' : `${count} readers left a little warmth.`}</p>}
    {STORY_REACTIONS.filter(r => story.received_reactions.includes(r.id)).map(r => <p key={r.id} className="g-small">“{r.label}”</p>)}
    <p>A little of your experience reached someone else.</p>
  </details>
}
