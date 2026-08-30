import {
  SESSION_MODES, SESSION_MODE_KEYS, INTERVIEW_CATEGORIES, INTERVIEW_CATEGORY_KEYS,
  skillsFor, validateSessionSetup, describeSession,
} from '../../data/practiceModes'
import {
  MEETING_METHODS, MEETING_METHOD_KEYS, MEETING_URL_MAX,
  validateMeetingUrl, validateMeetingSetup, describeMeeting,
} from '../../data/meetingMethods'

// ── Session agreement: mode → interview type → skill focus ──────────
// Lives INSIDE the existing scheduling flow (no separate matching, no
// new navigation). Every label, duration and skill comes from
// src/data/practiceModes.js.
//
// Nothing is preselected: the user must choose a mode deliberately.
// When the database cannot yet store the agreement, the fields render
// disabled with an honest note and the existing plain scheduling
// continues to work — a selection is never kept in local state or in
// a chat message and passed off as recorded.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
  matcha: '#6E7F4A', matchaSoft: '#EDF0E4',
}
const FONT = 'Inter, system-ui, sans-serif'

const Label = ({ children }) => (
  <p style={{ margin: '0 0 7px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: C.ink3, fontFamily: FONT }}>
    {children}
  </p>
)

/**
 * @param value      { mode, category, skillFocus }
 * @param onChange   (next) => void
 * @param supported  false when the session upgrade is not live yet
 */
export default function SessionSetupFields({ value, onChange, supported = true, compact = false }) {
  const { mode, category, skillFocus } = value
  const modeMeta = SESSION_MODES[mode]
  const skills = skillsFor(category)
  const disabled = !supported

  const set = (patch) => {
    const next = { ...value, ...patch }
    // changing the interview type clears a focus that belonged to the
    // other rubric, so the two lists can never be mixed
    if (patch.category && patch.category !== category) next.skillFocus = null
    // a Full Mock Swap keeps an optional focus; nothing else changes
    onChange(next)
  }

  return (
    <div style={{ display: 'grid', gap: compact ? 12 : 14 }}>
      {!supported && (
        <div style={{
          background: C.goldBg, border: `1px solid ${C.goldLight}`, borderRadius: 12,
          padding: '9px 12px',
        }}>
          <p style={{ margin: 0, fontSize: 11.5, color: '#8A6E1E', lineHeight: 1.5, fontFamily: FONT }}>
            Mock interview modes switch on once the session upgrade is enabled. Until then you can still
            agree a time here, and the mode is simply not recorded.
          </p>
        </div>
      )}

      <div>
        <Label>Mock interview mode</Label>
        <div style={{ display: 'grid', gap: 8 }}>
          {SESSION_MODE_KEYS.map((k) => {
            const m = SESSION_MODES[k]
            const on = mode === k
            return (
              <button key={k} type="button" disabled={disabled}
                onClick={() => set({ mode: k })}
                aria-pressed={on}
                style={{
                  textAlign: 'left', background: on ? C.matchaSoft : C.white,
                  border: `1.5px solid ${on ? C.matcha : C.line}`, borderRadius: 14,
                  padding: '11px 13px', cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.55 : 1, fontFamily: FONT,
                }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{m.label}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 650, color: on ? C.matcha : C.ink3 }}>
                    {m.durationLabel}
                  </span>
                </span>
                <span style={{ display: 'block', marginTop: 3, fontSize: 11.5, color: C.ink2, lineHeight: 1.45 }}>
                  {m.description}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <Label>Interview type</Label>
        <div style={{ display: 'flex', gap: 8 }}>
          {INTERVIEW_CATEGORY_KEYS.map((k) => {
            const on = category === k
            return (
              <button key={k} type="button" disabled={disabled}
                onClick={() => set({ category: k })}
                aria-pressed={on}
                style={{
                  flex: 1, background: on ? C.matchaSoft : C.white,
                  border: `1.5px solid ${on ? C.matcha : C.line}`, borderRadius: 12,
                  padding: '9px 6px', fontSize: 12.5, fontWeight: 650,
                  color: on ? C.matcha : C.ink2, fontFamily: FONT,
                  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
                }}>
                {INTERVIEW_CATEGORIES[k].label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Skill focus: required for a drill, optional for a full mock,
          and always drawn from the chosen interview type only. */}
      {mode && category && (
        <div>
          <Label>
            {modeMeta.focus === 'required' ? 'Skill focus' : 'Skill focus · optional'}
          </Label>
          <p style={{ margin: '-3px 0 7px', fontSize: 11, color: C.ink3, lineHeight: 1.45, fontFamily: FONT }}>
            {modeMeta.focusHint}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {skills.map((s) => {
              const on = skillFocus === s.key
              return (
                <button key={s.key} type="button" disabled={disabled}
                  onClick={() => set({ skillFocus: on ? null : s.key })}
                  aria-pressed={on}
                  style={{
                    background: on ? C.matchaSoft : C.white,
                    border: `1px solid ${on ? C.matcha : C.line}`, borderRadius: 99,
                    padding: '6px 12px', fontSize: 11.5, fontWeight: 600,
                    color: on ? C.matcha : C.ink2, fontFamily: FONT,
                    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
                  }}>
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {/* How will you meet? Mutu creates no meetings: the sender makes
          the call in Teams or Zoom and pastes the link. */}
      <div>
        <Label>How will you meet?</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {MEETING_METHOD_KEYS.map((k) => {
            const on = value.meetingMethod === k
            return (
              <button key={k} type="button"
                onClick={() => set({ meetingMethod: k, meetingUrl: '', meetingLocation: '' })}
                aria-pressed={on}
                style={{
                  minHeight: 44, background: on ? C.matchaSoft : C.white,
                  border: `1px solid ${on ? C.matcha : C.line}`, borderRadius: 99,
                  padding: '8px 13px', fontSize: 12, fontWeight: 650,
                  color: on ? C.matcha : C.ink2, fontFamily: FONT, cursor: 'pointer',
                }}>
                {MEETING_METHODS[k].label}
              </button>
            )
          })}
        </div>

        {value.meetingMethod && (() => {
          const meta = MEETING_METHODS[value.meetingMethod]
          const raw = meta.online ? value.meetingUrl : value.meetingLocation
          const check = meta.online && raw ? validateMeetingUrl(raw, value.meetingMethod) : null
          return (
            <div style={{ marginTop: 10 }}>
              <label htmlFor="meeting-field"
                style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 650, color: C.ink2, fontFamily: FONT }}>
                {meta.fieldLabel}
                {!meta.online && <span style={{ fontWeight: 500, color: C.ink3 }}> optional</span>}
              </label>
              <input id="meeting-field" type={meta.online ? 'url' : 'text'}
                inputMode={meta.online ? 'url' : 'text'}
                value={raw || ''}
                maxLength={meta.online ? MEETING_URL_MAX : 160}
                onChange={(e) => set(meta.online
                  ? { meetingUrl: e.target.value }
                  : { meetingLocation: e.target.value })}
                placeholder={meta.placeholder}
                style={{
                  width: '100%', boxSizing: 'border-box', minHeight: 44,
                  border: `1px solid ${check && !check.ok ? '#B4232A' : C.line}`,
                  borderRadius: 12, padding: '10px 12px', fontSize: 13,
                  color: C.ink, fontFamily: FONT, background: C.white,
                }} />
              <p style={{ margin: '5px 0 0', fontSize: 11, color: check && !check.ok ? '#B4232A' : C.ink3, lineHeight: 1.45, fontFamily: FONT }}>
                {check && !check.ok ? check.message : meta.help}
              </p>
              {check?.ok && (
                <p style={{ margin: '3px 0 0', fontSize: 11, color: C.matcha, fontFamily: FONT }}>
                  {meta.short} · {check.host}
                </p>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

/**
 * The summary both people see: the proposer before sending, and the
 * receiving participant before accepting. Same fields, same words.
 */
export function SessionSummary({ setup, whenLabel, note = null }) {
  const check = validateSessionSetup(setup)
  const described = describeSession({
    session_mode: setup.mode,
    interview_category: setup.category,
    skill_focus: setup.skillFocus,
  })
  if (!check.ok) {
    return (
      <div style={{
        background: C.white, border: `1px solid ${C.line}`, borderRadius: 14, padding: '11px 13px',
      }}>
        <p style={{ margin: 0, fontSize: 12, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
          {check.message}
        </p>
      </div>
    )
  }
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.line}`, borderRadius: 14, padding: '11px 13px',
    }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: FONT }}>
        {described.title}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 12, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
        {described.categoryLabel}
        {described.focusLabel ? <><br />Focus: {described.focusLabel}</> : null}
        <br />{described.durationLabel}
        {whenLabel ? <><br />{whenLabel}</> : null}
      </p>
      {(() => {
        const meeting = describeMeeting({
          meeting_method: setup.meetingMethod,
          meeting_url: setup.meetingUrl,
          meeting_location: setup.meetingLocation,
        })
        if (!meeting.recorded) return null
        return (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
            {meeting.label}
            {meeting.host ? <><br />{meeting.host}</> : null}
            {meeting.location ? <><br />{meeting.location}</> : null}
          </p>
        )
      })()}
      <p style={{ margin: '7px 0 0', fontSize: 11.5, color: C.matcha, fontFamily: FONT, lineHeight: 1.45 }}>
        {note || described.agreement}
      </p>
    </div>
  )
}
