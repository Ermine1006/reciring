import { NotebookPen } from 'lucide-react'
import './StoryGarden.css'

export default function StoryGardenEntry({ onOpen }) {
  return (
    <div className="mutu-story-garden" style={{ padding: '0 16px' }}>
      <section className="g-home-entry" aria-labelledby="garden-entry-title">
        <div className="g-line"><div className="g-eyebrow">A little room to be yourself</div><NotebookPen size={23} aria-hidden="true" /></div>
        <h2 id="garden-entry-title">The Story Garden</h2>
        <p>Wander through real experiences, or leave a page of your own.</p>
        <button type="button" className="g-primary" onClick={onOpen}>Step into the garden</button>
      </section>
    </div>
  )
}
