// ─────────────────────────────────────────────────────────────────────────
// LinkedIn import → Mutu profile merge (pure, testable).
//
// Golden rule (per the brief): NEVER silently overwrite a non-empty existing
// Mutu value. The import only fills blanks, unless the user explicitly chooses
// to replace a field in the review step.
//
// Only three claims map onto the public profile:
//   name    → profiles.name
//   picture → profiles.avatar_url        (stored as the raw https URL)
//   headline→ profiles.professional_headline
// email is shown as read-only context and is NEVER written (the verified Mutu
// login email stays the source of truth).
// ─────────────────────────────────────────────────────────────────────────

// The reviewable field set: what LinkedIn returned vs what's already on the
// profile, and whether importing would replace something.
export const IMPORT_FIELDS = [
  { key: 'name',     column: 'name',                  label: 'Name' },
  { key: 'picture',  column: 'avatar_url',            label: 'Profile photo' },
  { key: 'headline', column: 'professional_headline', label: 'Headline' },
]

// Build the review rows. Each row says: the incoming value, the current value,
// whether it's new (blank locally) or a conflict, and a default `use` decision
// (default ON only when it doesn't overwrite existing content).
export function buildImportReview(existingRow = {}, claims = {}) {
  return IMPORT_FIELDS
    .map(f => {
      const imported = String(claims[f.key] || '').trim()
      if (!imported) return null // nothing returned for this field
      const existing = String(existingRow[f.column] || '').trim()
      const conflict = Boolean(existing) && existing !== imported
      return { ...f, imported, existing, conflict, use: !conflict }
    })
    .filter(Boolean)
}

// Apply the user's accepted choices to a patch. `choices` maps field key →
// boolean (use imported?); `values` optionally carries inline-edited text.
// `use` is the final decision — it defaults OFF for conflicts (so an existing
// non-empty value is never replaced unless the user turned it on) and ON for
// blanks. A field is only written when the user keeps it on.
export function applyImport(rows = [], choices = {}, values = {}) {
  const patch = {}
  const importedFields = []
  for (const r of rows) {
    const use = Object.prototype.hasOwnProperty.call(choices, r.key) ? choices[r.key] : r.use
    if (!use) continue
    const raw = Object.prototype.hasOwnProperty.call(values, r.key) ? values[r.key] : r.imported
    const val = String(raw || '').trim()
    if (!val) continue
    patch[r.column] = val
    importedFields.push(r.key)
  }
  return { patch, importedFields }
}
