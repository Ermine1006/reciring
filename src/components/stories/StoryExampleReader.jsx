import { Leaf } from 'lucide-react'
import { STORY_TOPIC_LABELS } from '../../data/storiesContent'
import { STORY_EXAMPLE_WRITERS } from '../../data/storyExamples'

// A separate reader keeps fictional IDs away from real replies, bookmarks,
// reports, and writing actions. Begin a page always opens an empty draft.
export default function StoryExampleReader({ example, headingRef, onBack, onNext, onWrite }) {
  const writer = STORY_EXAMPLE_WRITERS[example.writer]
  return <section className="g-page">
    <button type="button" className="g-back" onClick={onBack}>← Back to the garden</button>
    <div className="g-paper">
      <p className="g-example-label">Fictional example</p>
      <div className="g-eyebrow">{STORY_TOPIC_LABELS[example.topic]}</div>
      <h1 ref={headingRef} tabIndex={-1}>{example.title}</h1>
      <p className="g-small"><strong>{writer.name}</strong> · {writer.role} · Fictional writer</p>
      <p className="g-small g-example-writer-note">{writer.note}</p>
      <div className="g-body">{example.body}</div>
      <div className="g-margin-note"><p className="g-small">A made up writer and story, created for this demo. Your page can be short, messy, or still in progress.</p></div>
      <div className="g-botanical"><Leaf aria-hidden="true" /></div>
    </div>
    <div className="g-line">
      <button type="button" className="g-primary" onClick={onWrite}>Begin my own page</button>
      {onNext && <button type="button" className="g-link" onClick={onNext}>Another example →</button>}
    </div>
  </section>
}
