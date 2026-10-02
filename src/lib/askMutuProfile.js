import {
  labelForTopic, labelForIndustry, labelForInterest, labelForActivity, labelForHelping,
} from '../data/profileTaxonomy'

const text = (value, limit = 200) => typeof value === 'string' ? value.trim().slice(0, limit) || null : null
const list = (values, label = value => value) => Array.isArray(values)
  ? [...new Set(values.filter(value => typeof value === 'string').map(value => text(label(value), 80)).filter(Boolean))].slice(0, 10)
  : []

// Explicit allowlist, never send an entire database profile to the model.
// A present but empty v3 field is intentional, not a reason to revive old tags.
export function buildProfileContext(profile) {
  if (!profile || typeof profile !== 'object') return null
  return {
    name: text(profile.name),
    program: text(profile.program),
    career_stage: text(profile.career_stage),
    headline: text(profile.professional_headline ?? profile.headline),
    title: text(profile.title),
    company: text(profile.company),
    industries_known: list(profile.industries_known, labelForIndustry),
    interests: list(profile.industries_exploring ?? profile.industry_interests ?? profile.interests, labelForIndustry),
    expertise_offered: list(profile.expertise_offered, labelForTopic),
    help_wanted: list(profile.help_wanted, labelForTopic),
    helping_preferences: list(profile.helping_preferences ?? profile.can_help_with, labelForHelping),
    // Legacy fields described as formats, never as evidence of expertise.
    can_help_with: list(profile.helping_preferences ?? profile.can_help_with, labelForHelping),
    wants_help_with: list(profile.skills_to_learn ?? profile.wants_help_with),
    looking_for: list(profile.networking_intent ?? profile.looking_for),
    personal_interests: list(profile.personal_interests, labelForInterest),
    activity_preferences: list(profile.activity_preferences, labelForActivity),
    prompt_ask_me: text(profile.prompt_ask_me, 400),
    prompt_weekend: text(profile.prompt_weekend, 400),
    prompt_seeking: text(profile.prompt_seeking, 400),
  }
}
