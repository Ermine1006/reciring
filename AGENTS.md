# Mutu (reciring)

## Behavioral UX skill (mandatory)

Before designing, reviewing or modifying ANY Mutu user journey, page, component, interaction, notification, empty state, onboarding flow, matching experience, AI feature, Community Map, My Circle, Together activity, or token/reputation experience, invoke the `mutu-behavioral-ux` skill and follow its process, lenses, dark-pattern veto and final quality test. North Star: completed and mutually verified exchanges — never raw screen time.

## Standing project rules

- The founder runs ALL SQL manually in the Supabase SQL Editor. Never run SQL against Supabase, never modify production data, never commit git unless the founder explicitly asks.
- Career Focus taxonomy: `src/data/careerFocus.js` is the single source of truth. Never hard-code category lists elsewhere; IB/PE/VC are Finance specializations, never top-level.
- Internal names stay unchanged (`practice_*` tables/RPCs/components, `mutu_practice` flag); user-facing naming is Together / Career Focus / My Circle / Community Map.
- User-facing copy: no dashes, warm tone, reciprocal (never transactional) language.
- Feature flags ship dark (`mutu_practice`, `mutu_home_graph`); never change rollout defaults.
