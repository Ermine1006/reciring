# Private peer skill feedback

Harsimar refinement: optional 1–5 ratings for up to three observed skills, plus Leadership in case feedback. Behavioural categories remain unchanged. Existing strengths and teammate recognition remain separate from ratings. A high rating does not automatically create a public badge.

## Experience

Complete both rounds → choose strengths / optionally rate observed skills → review → submit confirmation. No score is preselected; Not rated clears a selection. Labels explain each score. Leadership means guiding the discussion, making decisions and responding to input. Matcha controls and existing ivory surfaces remain.

The aim is actionable feedback without a public ranking or more mandatory work. Ease, agency and earned progress are the design priorities. Success is useful completed feedback and repeat reciprocal practice, not rating volume.

Ratings appear privately in session details and the existing message session card after mutual verification. They never enter pool cards, matching scores, notification bodies or public profiles. Existing voluntary strength sharing still applies to Leadership endorsements. Leadership is shared across case preferences, support skills, session focus and feedback. The migration extends preference and session constraints before the frontend is deployed.

## Database activation (founder only)

Run scripts/migration-practice-skill-ratings.sql manually after the existing teammate-feedback migration. The app probes practice_skill_ratings_supported; without support it retains the old flow. No SQL was executed by Codex. No production data was changed or backfilled.

The new authenticated RPC validates skill/category, integer score 1–5, maximum three scores and completed rounds. It wraps the existing authoritative confirmation RPC in one transaction, so errors roll back ratings, confirmation and token changes together. The existing RPC retains participant/block checks. Table reads require a participant and a verified session; direct client writes are revoked. Run with your normal migration owner so it can call the internal skill-category function.

## Manual acceptance after migration

- Two participants complete a case practice. Submit Leadership 4 and Structuring 2 alongside a separately selected strength.
- Before the second confirmation neither participant can read ratings; after verification the recipient sees both values. An unrelated account cannot read them.
- Behavioural feedback has no Leadership option. All its previous categories remain.
- Reject wrong-category skills, unknown keys, null/string/fractional/out-of-range scores, more than three skills, nonparticipant and blocked submissions.
- Repeated submission must not create duplicate ratings or tokens. A failed submission must leave the editable client draft present.
- No-show and cancelled outcomes send no ratings. Missing migration leaves existing confirmation usable.
- Verify pool cards show only explicitly shared endorsements, never numerical ratings.

## Validation limits

Component tests cover optional/clearable/capped ratings, rubric separation, review/submission payload and legacy capability fallback. Build passes. SQL and RLS require the founder's database validation; no live two-account or device visual test was performed.
