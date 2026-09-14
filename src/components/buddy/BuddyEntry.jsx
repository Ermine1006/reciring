import { matchaCta } from '../../lib/matchaCta'
import './buddy.css'
export default function BuddyEntry({ onOpen }) {
 return <section className="buddy-entry"><div className="buddy-entry-art" aria-hidden="true"/><div><h3>Buddy Program</h3><p>Share what you need. Find support that fits.</p><button type="button" className="buddy-primary" style={matchaCta} onClick={onOpen}>Find your buddy →</button></div></section>
}
