import { Flower2, Leaf, Sprout } from 'lucide-react'

export const DEFAULT_COVER = { color: 'matcha', stamp: 'leaf', pen_name: '', version: 0 }
const stamps = { leaf: Leaf, flower: Flower2, sprout: Sprout }

export default function StoryNotebookCover({ cover, name, onChange, onSave, busy, ready, dirty, error, onRetry }) {
  const Stamp = stamps[cover.stamp] || Leaf
  return <section aria-label="Your private story collection">
    <div className={`g-collection g-collection-${cover.color}`}>
      <span className="g-eyebrow">A little collection, entirely yours.</span>
      <Stamp className="g-cover-stamp" size={56} strokeWidth={1} aria-hidden="true" />
      <h2>Pages by {cover.pen_name.trim() || name || 'me'}</h2>
      <p>Your words. Still becoming.</p>
      <span className="g-small">Your private notebook</span>
    </div>
    <details className="g-cover-options"><summary>Make this cover yours</summary>
      <p className="g-small">Only you see this cover and pen name. Each story keeps the identity you chose when sharing it.</p>
      {error && <p role="alert" className="g-error">{error}</p>}
      {!ready ? <button type="button" className="g-link" onClick={onRetry}>Load my cover settings</button> : <form onSubmit={e => { e.preventDefault(); onSave() }}>
        <fieldset disabled={busy}><legend>Paper color</legend><div className="g-line">
          {['matcha', 'cream', 'lilac'].map(color => <button key={color} type="button" className="g-outline" aria-pressed={cover.color === color} onClick={() => onChange({ ...cover, color })}>{color[0].toUpperCase() + color.slice(1)}</button>)}
        </div></fieldset>
        <fieldset disabled={busy}><legend>Botanical stamp</legend><div className="g-line">
          {Object.entries(stamps).map(([stamp, Icon]) => <button key={stamp} type="button" className="g-outline" aria-label={stamp} aria-pressed={cover.stamp === stamp} onClick={() => onChange({ ...cover, stamp })}><Icon size={22} aria-hidden="true" /></button>)}
        </div></fieldset>
        <label htmlFor="cover-pen-name">Private cover pen name</label>
        <input id="cover-pen-name" maxLength={60} value={cover.pen_name} placeholder={name || 'Your pen name'} disabled={busy} onChange={e => onChange({ ...cover, pen_name: e.target.value })} />
        <button className="g-outline" type="submit" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save my cover'}</button>
        <p className="g-small">{dirty ? 'Cover changes are not saved yet.' : 'Your saved cover follows you across devices.'}</p>
      </form>}
    </details>
  </section>
}
