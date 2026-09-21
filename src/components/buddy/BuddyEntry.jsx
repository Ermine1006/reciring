import { matchaCta } from '../../lib/matchaCta'
import './buddy-entry.css'
export default function BuddyEntry({ onOpen }) {
 return <section className="mutu-connection-card buddy-entry" data-tone="matcha"><span className="mutu-connection-art" aria-hidden="true"/><h3>Buddy Program</h3><p>Share what you need. Find support that fits.</p><button type="button" data-mutu-glass="" style={matchaCta} onClick={onOpen}>Find your buddy →</button></section>
}
