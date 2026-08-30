import { useMemo, useState } from 'react'
import {
  evaluateMilestones, recommendNext, coverageLabel, MILESTONES,
} from '../../lib/practicePassport'
import { SESSION_MODES, INTERVIEW_CATEGORIES } from '../../data/practiceModes'
import { suggestionLabelAnywhere } from '../../data/practiceFeedback'

// ── Practice Passport ───────────────────────────────────────────────
// A private record of verified live practice: how much, with how many
// different people, in which role. Everything here is computed by the
// canonical layer in lib/practicePassport.js — this file only renders.
//
// Private by construction: it is built from the signed-in user's own
// sessions and their own confirmation rows. No partner feedback, no
// no-show history, no disputes, no other member's practice, and a
// partner name only when that identity is already unlocked.
//
// Nothing here ranks, scores or compares members.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
  matcha: '#6E7F4A', matchaSoft: '#EDF0E4',
}
const FONT = 'Inter, system-ui, sans-serif'

const Stat = ({ value, label }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: 19, fontWeight: 750, color: C.ink, fontFamily: FONT, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </div>
    <div style={{ fontSize: 10.5, color: C.ink2, fontFamily: FONT, lineHeight: 1.3, marginTop: 1 }}>
      {label}
    </div>
  </div>
)

/** Compact card for the top of the Practice Hub. */
export function PassportCard({ passport, onOpen }) {
  const p = passport
  const rec = useMemo(() => recommendNext(p), [p])
  const empty = p.verified === 0

  return (
    <section style={{
      margin: '14px 16px 0', background: C.white, border: `1px solid ${C.line}`,
      borderRadius: 18, padding: '13px 14px 12px', boxShadow: '0 3px 14px rgba(60,45,10,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.goldDark} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3.5h11a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H5z" />
            <path d="M18 7.5h1.5M18 12h1.5M18 16.5h1.5" />
            <circle cx="10.5" cy="10" r="2.4" /><path d="M7 16c.6-1.7 2-2.6 3.5-2.6s2.9.9 3.5 2.6" />
          </svg>
          <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: C.ink, fontFamily: FONT, letterSpacing: '-0.01em' }}>
            Mock Interview Passport
          </h3>
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onOpen}
          style={{
            flexShrink: 0, border: `1px solid ${C.line}`, background: C.white, color: C.ink2,
            borderRadius: 99, padding: '5px 11px', fontSize: 11, fontWeight: 650,
            fontFamily: FONT, cursor: 'pointer',
          }}>
          View progress
        </button>
      </div>

      {empty ? (
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: C.ink2, lineHeight: 1.5, fontFamily: FONT }}>
          Your Passport fills in after you and a partner both confirm a completed practice.
        </p>
      ) : (
        <>
          <p style={{ margin: '7px 0 0', fontSize: 11.5, color: C.ink2, fontFamily: FONT }}>
            {p.verified} verified mock interview{p.verified === 1 ? '' : 's'}
            {' · '}
            {p.partners} different partner{p.partners === 1 ? '' : 's'}
          </p>
          <div style={{ display: 'flex', gap: 22, marginTop: 10 }}>
            <Stat value={p.candidateRounds} label="Candidate rounds" />
            <Stat value={p.interviewerRounds} label="Interviewer rounds" />
          </div>
        </>
      )}

      <p style={{
        margin: '10px 0 0', paddingTop: 9, borderTop: `1px solid ${C.line}`,
        fontSize: 11.5, color: C.matcha, fontFamily: FONT, lineHeight: 1.45,
      }}>
        {rec.text}
      </p>
    </section>
  )
}

const Section = ({ title, note, children }) => (
  <section style={{ padding: '0 16px', marginTop: 18 }}>
    <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: FONT, letterSpacing: '-0.01em' }}>
      {title}
    </h3>
    {note && (
      <p style={{ margin: '3px 0 0', fontSize: 10.5, color: C.ink3, lineHeight: 1.45, fontFamily: FONT }}>
        {note}
      </p>
    )}
    <div style={{ marginTop: 9 }}>{children}</div>
  </section>
)

const Row = ({ label, value, dim }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
    borderBottom: `1px solid ${C.line}`,
  }}>
    <span style={{ fontSize: 12, color: dim ? C.ink3 : C.ink, fontFamily: FONT, minWidth: 0, flex: 1 }}>
      {label}
    </span>
    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: dim ? C.ink3 : C.ink2, fontFamily: FONT }}>
      {value}
    </span>
  </div>
)

/** The detailed Passport: five sections, private to this user. */
export function PassportDetail({ passport, onClose, onCta, sessionById = {}, onReportFeedback }) {
  const [showAllFeedback, setShowAllFeedback] = useState(false)
  const p = passport
  const rec = useMemo(() => recommendNext(p), [p])
  const milestones = useMemo(() => evaluateMilestones(p), [p])
  const recorded = p.structuredRecorded

  return (
    <div style={{ paddingBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 16px 0' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 750, color: C.ink, fontFamily: FONT, letterSpacing: '-0.015em' }}>
          Mock Interview Passport
        </h2>
        <span style={{ flex: 1 }} />
        {onClose && (
          <button type="button" onClick={onClose}
            style={{
              border: `1px solid ${C.line}`, background: C.white, color: C.ink2,
              borderRadius: 99, padding: '5px 12px', fontSize: 11, fontWeight: 650,
              fontFamily: FONT, cursor: 'pointer',
            }}>
            Close
          </button>
        )}
      </div>
      <p style={{ margin: '4px 16px 0', fontSize: 11, color: C.ink3, fontFamily: FONT, lineHeight: 1.45 }}>
        Private to you. Only practices you and your partner both confirmed are counted.
      </p>

      {/* ── Overview ── */}
      <Section title="Overview">
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
          background: C.white, border: `1px solid ${C.line}`, borderRadius: 15, padding: '13px 14px',
        }}>
          <Stat value={p.verified} label="Verified practices" />
          <Stat value={p.partners} label="Different partners" />
          <Stat value={p.candidateRounds} label="Candidate rounds" />
          <Stat value={p.interviewerRounds} label="Interviewer rounds" />
        </div>
        {p.goal && (
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
            <span style={{ color: C.ink3 }}>Current goal: </span>{p.goal}
          </p>
        )}
      </Section>

      {/* ── Mock interview variety: mode + interview type ── */}
      <Section
        title="Mock interview variety"
        note={recorded
          ? 'What you and your partners agreed to practise, from verified sessions.'
          : 'The mode and interview type are recorded from the moment you schedule with a mode. Earlier sessions stay Not recorded rather than guessed.'}>
        <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 650, color: C.ink2, fontFamily: FONT }}>Modes</p>
        {p.modes.map((m) => (
          <Row key={m.key} label={m.label}
            value={coverageLabel(m.count, { recorded })}
            dim={!recorded || m.count === 0} />
        ))}
        <p style={{ margin: '11px 0 2px', fontSize: 11, fontWeight: 650, color: C.ink2, fontFamily: FONT }}>Interview types</p>
        {p.categories.map((c) => (
          <Row key={c.key} label={c.label}
            value={coverageLabel(c.count, { recorded })}
            dim={!recorded || c.count === 0} />
        ))}
        {p.unrecordedSessions > 0 && (
          <p style={{ margin: '9px 0 0', fontSize: 10.5, color: C.ink3, lineHeight: 1.5, fontFamily: FONT }}>
            {p.unrecordedSessions} earlier verified mock interview{p.unrecordedSessions === 1 ? '' : 's'} recorded no mode.
          </p>
        )}
      </Section>

      {/* ── Role balance ── */}
      <Section
        title="Role balance"
        note="A role counts only when you confirmed you completed it, not from attending.">
        <Row label="Candidate" value={coverageLabel(p.candidateRounds)} dim={p.candidateRounds === 0} />
        <Row label="Interviewer" value={coverageLabel(p.interviewerRounds)} dim={p.interviewerRounds === 0} />
        <Row label="Both roles in one practice" value={coverageLabel(p.reciprocalSessions)} dim={p.reciprocalSessions === 0} />
        <p style={{ margin: '9px 0 0', fontSize: 10.5, color: C.ink3, lineHeight: 1.5, fontFamily: FONT }}>
          A mock interview where you both take a turn counts once as verified, and once in each role.
        </p>
      </Section>

      {/* ── Skill coverage ── */}
      <Section
        title="Skill coverage"
        note={recorded
          ? 'Only the skill each session actually selected. A count is practice, never proficiency.'
          : 'Skill focus appears once a session records one. Nothing here is inferred from how often you practise.'}>
        {p.skills.map((group) => (
          <div key={group.category} style={{ marginBottom: 10 }}>
            <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 650, color: C.ink2, fontFamily: FONT }}>
              {group.categoryLabel}
            </p>
            {group.items.map((sk) => (
              <Row key={sk.key} label={sk.label}
                value={coverageLabel(sk.count, { recorded, isFocus: sk.selected })}
                dim={!recorded || sk.count === 0} />
            ))}
          </div>
        ))}
      </Section>

      {/* ── Recommended next mock interview ── */}
      <Section title="Recommended next mock interview">
        <div style={{
          background: C.matchaSoft, border: `1px solid ${C.matcha}33`,
          borderRadius: 15, padding: '12px 13px',
        }}>
          <p style={{ margin: 0, fontSize: 12.5, color: C.ink, fontFamily: FONT, lineHeight: 1.5 }}>
            {rec.text}
          </p>
          <button type="button" onClick={() => onCta?.(rec.cta)}
            style={{
              marginTop: 10, width: '100%', border: 'none', borderRadius: 12,
              background: C.matcha, color: C.white, padding: '10px 0',
              fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
            }}>
            {rec.cta.label}
          </button>
        </div>
      </Section>

      {/* ── Feedback for your next mock interview (private) ── */}
      {p.feedbackSupported && p.feedbackReceived.length > 0 && (
        <Section
          title="Feedback for your next mock interview"
          note="Written by the partner you practised with. Only you can see it.">
          {(showAllFeedback ? p.feedbackReceived : p.feedbackReceived.slice(0, 1)).map((f) => {
            const s2 = sessionById?.[f.session_id]
            const context = [
              INTERVIEW_CATEGORIES[s2?.interview_category]?.label,
              SESSION_MODES[s2?.session_mode]?.label,
              f.created_at ? new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null,
            ].filter(Boolean).join(' · ')
            return (
              <div key={f.id} style={{
                background: C.white, border: `1px solid ${C.line}`, borderRadius: 14,
                padding: '11px 13px', marginBottom: 8,
              }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 650, color: C.ink, fontFamily: FONT, lineHeight: 1.45 }}>
                  {suggestionLabelAnywhere(f.suggestion_code) || 'A suggestion for next time'}
                </p>
                {f.note && (
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
                    {f.note}
                  </p>
                )}
                {context && (
                  <p style={{ margin: '5px 0 0', fontSize: 10.5, color: C.ink3, fontFamily: FONT }}>
                    {context}
                  </p>
                )}
                <button type="button" onClick={() => onReportFeedback?.(f)}
                  disabled={Boolean(f.reported_at)}
                  style={{
                    marginTop: 7, minHeight: 44, border: 'none', background: 'none', padding: '4px 0',
                    fontSize: 11, fontWeight: 600, color: C.ink3, fontFamily: FONT,
                    cursor: f.reported_at ? 'default' : 'pointer', textDecoration: 'underline',
                  }}>
                  {f.reported_at ? 'Reported for review' : 'Report inappropriate feedback'}
                </button>
              </div>
            )
          })}
          {p.feedbackReceived.length > 1 && (
            <button type="button" onClick={() => setShowAllFeedback((v) => !v)}
              style={{
                minHeight: 44, border: `1px solid ${C.line}`, background: C.white, color: C.ink2,
                borderRadius: 11, padding: '9px 14px', fontSize: 12, fontWeight: 650,
                fontFamily: FONT, cursor: 'pointer',
              }}>
              {showAllFeedback ? 'Show less' : 'View previous feedback'}
            </button>
          )}
        </Section>
      )}

      {/* ── Milestones (private) ── */}
      <Section title="Milestones" note="Private to you. Nothing here is shared or compared.">
        {milestones.map((m) => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderBottom: `1px solid ${C.line}`,
          }}>
            <span style={{
              flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
              border: `1.5px solid ${m.earned ? C.goldDark : C.line}`,
              background: m.earned ? C.goldBg : C.white,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {m.earned && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.goldDark} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12.5l5.5 5.5L20 7" />
                </svg>
              )}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 650, color: m.earned ? C.ink : C.ink2, fontFamily: FONT }}>
                {m.label}
              </span>
              <span style={{ display: 'block', fontSize: 10.5, color: C.ink3, fontFamily: FONT, lineHeight: 1.4 }}>
                {m.hint}
              </span>
            </span>
          </div>
        ))}
      </Section>
    </div>
  )
}

export default PassportCard
export { MILESTONES }
