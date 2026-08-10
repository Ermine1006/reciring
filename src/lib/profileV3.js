// ─────────────────────────────────────────────────────────────────────────
// Profile v3 — pure mapping between the DB `profiles` row and the shapes the
// redesigned components use, plus the idempotent legacy→v3 backfill computation.
//
// Pure (imports only the taxonomy) so it can be unit-tested and reused by the
// wiring layer. The Supabase read/write lives in the caller.
// ─────────────────────────────────────────────────────────────────────────
import { resolveLegacyIndustry, LEGACY_HELPTYPE_TO_HELPING } from '../data/profileTaxonomy'

const A = (x) => Array.isArray(x) ? x : []

// DB row → wizard draft (the shape ProfileWizard edits).
export function rowToDraft(row = {}) {
  return {
    program:              row.program || '',
    graduationYear:       row.graduation_year || null,
    title:                row.title || '',
    company:              row.company || '',
    professionalHeadline: row.professional_headline || '',
    industriesKnown:      A(row.industries_known),
    industriesExploring:  A(row.industries_exploring),
    expertiseOffered:     A(row.expertise_offered),
    helpWanted:           A(row.help_wanted),
    promptAskMe:          row.prompt_ask_me || '',
    interests:            A(row.personal_interests),
    activities:           A(row.activity_preferences),
    promptWeekend:        row.prompt_weekend || '',
    promptSeeking:        row.prompt_seeking || '',
    helpingPreferences:   A(row.helping_preferences),
  }
}

// Wizard draft → DB column patch (only v3 columns; legacy columns untouched).
export function draftToPatch(d = {}) {
  return {
    program:               d.program || '',
    graduation_year:       d.graduationYear || null,
    title:                 d.title || '',
    company:               d.company || '',
    professional_headline: d.professionalHeadline || '',
    industries_known:      A(d.industriesKnown),
    industries_exploring:  A(d.industriesExploring),
    expertise_offered:     A(d.expertiseOffered),
    help_wanted:           A(d.helpWanted),
    prompt_ask_me:         d.promptAskMe || '',
    personal_interests:    A(d.interests),
    activity_preferences:  A(d.activities),
    prompt_weekend:        d.promptWeekend || '',
    prompt_seeking:        d.promptSeeking || '',
    helping_preferences:   A(d.helpingPreferences),
  }
}

// DB row → ProfileView props (ProfileView resolves ids→labels itself).
export function rowToViewProps(row = {}) {
  return {
    name: row.name, verified: true,
    professionalHeadline: row.professional_headline || row.headline || '',
    program: row.program || '', location: row.location || '',
    expertiseOffered: A(row.expertise_offered),
    helpWanted: A(row.help_wanted),
    personalInterests: A(row.personal_interests),
    activities: A(row.activity_preferences),
    promptAskMe: row.prompt_ask_me || '',
  }
}

// DB row → profileMatch shape.
export function rowToMatchShape(row = {}) {
  return {
    name: row.name,
    expertiseOffered: A(row.expertise_offered),
    helpWanted: A(row.help_wanted),
    industriesKnown: A(row.industries_known),
    industriesExploring: A(row.industries_exploring),
    personalInterests: A(row.personal_interests),
    activities: A(row.activity_preferences),
    helpingPreferences: A(row.helping_preferences),
  }
}

// Whether a row still needs the one-time v3 backfill/review.
export function needsV3Backfill(row = {}) {
  return !row.profile_v3_migrated_at
}

// Idempotent legacy→v3 backfill. Returns { patch, log } and NEVER overwrites a
// v3 field that already has data. `log` records every legacy value that could
// not be mapped, so nothing is silently dropped.
export function computeBackfill(row = {}, nowIso) {
  const patch = {}
  const log = []
  const empty = (v) => !Array.isArray(v) || v.length === 0

  // industry_interests → industries_known (canonical ids); unmapped → log
  if (empty(row.industries_known) && A(row.industry_interests).length) {
    const mapped = []
    for (const val of A(row.industry_interests)) {
      const id = resolveLegacyIndustry(val)
      if (id) mapped.push(id)
      else log.push({ field: 'industry_interests', legacy_value: String(val), note: 'unmapped industry' })
    }
    if (mapped.length) patch.industries_known = dedupe(mapped)
  }

  // can_help_with (legacy interaction formats) → helping_preferences
  if (empty(row.helping_preferences) && A(row.can_help_with).length) {
    const mapped = []
    for (const val of A(row.can_help_with)) {
      const id = LEGACY_HELPTYPE_TO_HELPING[val]
      if (id) mapped.push(id)
      else log.push({ field: 'can_help_with', legacy_value: String(val), note: 'unmapped helping format' })
    }
    if (mapped.length) patch.helping_preferences = dedupe(mapped)
  }

  // skills_to_learn held interaction formats too — they are NOT topics, so they
  // cannot become help_wanted. Record them rather than fabricate expertise.
  for (const val of A(row.skills_to_learn)) {
    log.push({ field: 'skills_to_learn', legacy_value: String(val), note: 'legacy interaction format — add real topics in Review' })
  }

  // legacy headline held the role/title → title (if not already set)
  if (!row.title && row.headline) patch.title = String(row.headline).slice(0, 80)

  patch.profile_v3_migrated_at = nowIso
  return { patch, log }
}

function dedupe(a) { return [...new Set(a)] }
