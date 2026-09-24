# Consulting and Finance practice

## Scope

Production components now group practice by career direction, using `careerFocus.js` labels.
Consulting retains `case` and `behavioural`. Finance adds core technical (`finance`),
`finance_debt`, `finance_markets` and `finance_behavioural`.
Finance behavioural uses the same rubric with separate skill keys to preserve context.
Existing case and behavioural session records are not rewritten.

The new hierarchy is used in quick setup, the preference type editor, partner garden
filters and scheduling. Preferences, rating input, feedback display and Passport read
the extended canonical taxonomy. Each new skill has a guided drill and full mock guide.
Requests remain reciprocal. Topic preferences rank existing eligible candidates;
matching is not a claim that a peer is qualified to teach a topic.

## UX decisions

The user wants to find a relevant peer without a long setup or fear of being judged.
The previous flat Case / Behavioural / Finance row mixed career direction and format.
The replacement uses career direction, then interview type, then optional skill focus.
The relevant motivation lenses are ease, agency and earned progress: reveal only relevant
choices, preserve existing selections when browsing another direction, and reward only
mutually confirmed practice. Selected want/help types are summarised before saving.

Existing ivory/gold surfaces, matcha buttons, pixel scenes, avatars, garden/list bypass,
anonymous discovery, mutual identity reveal, consented badges and token rules remain.
Loading, unavailable capability, retry and existing empty/error states stay explicit.
No new public ratings, readiness claims, rankings, notification pressure or animation.
Success measures: scheduled sessions, mutually verified exchanges and useful repeat practice.

## Database prerequisite

Founder must manually run `scripts/migration-practice-finance.sql` in Supabase SQL Editor.
Never run it automatically against production. Prerequisites are the existing meeting-links,
starting-experience, teammate-feedback and skill-ratings migrations.

The migration widens allowlists, replaces the proposal RPC with the checked-in meeting-links
definition plus the new category allowlist, adds private observations to existing rating rows,
and adds an atomic confirmation wrapper. Review any live RPC changes outside this repository
before applying the replacement. It contains no backfill or production data rewrite.

The authenticated capability RPC enables new Finance selections only after the transaction
commits. Missing capability shows an unavailable message and retry, not a fake saved state.
To pause new Finance setup, make `practice_finance_supported()` return false. Do not delete
Finance taxonomy values once records exist.

WHAT / WHY / HOW are optional observations on rated technical/debt/markets skills.
They are not levels or a replacement for 1–5 ratings. A skipped rating does not write
observations for that topic. The existing rating RLS hides them until mutual verification,
from outsiders and across blocks. Explicit endorsements remain separate from ratings.

## Review and test

1. Before migration: Consulting works; Finance explains unavailable and prevents selection.
2. After migration: choose Finance, choose want/help types, publish and reload.
3. Personalise: select up to three focus/support skills, save, cancel changes, reload.
4. Use two eligible accounts to invite/accept. Verify no identity exposure before acceptance.
5. Schedule a core, debt, markets or behavioural session. Check categories and skills never mix.
6. Both participants practise and confirm. Submit a 1–5 rating and optional WHAT/WHY/HOW.
7. Before the second confirmation, private ratings stay hidden. Afterwards, only participants
   can read them. Verify exactly one shared token and no score on a public pool card.
8. Test mobile scrolling, modal controls, keyboard focus, desktop layout, retry and rebooking.
9. Repeat a Consulting case and behavioural session to check existing functionality.

The standalone `public/finance-ui/` flow remains a labelled fictional prototype. It makes
no API calls and creates no real invitations, confirmations or tokens. It is linked from
the existing demo section. It is not the production database integration.

Local checks cover component state and isolated PGlite migrations/RPC/RLS, not live Supabase,
TestFlight or two signed-in real accounts. Real-device visual QA is still required.
No commit or deployment is implied by these source changes.
