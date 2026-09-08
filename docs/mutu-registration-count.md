# Homepage Mutu registration total

Founder requested all Mutu registered users instead of the viewer-filtered Rotman member count. The old number was dynamic but excluded pending accounts, other communities and blocked members.

The new metric is the count of current non-anonymous Supabase Auth accounts across all communities, including pending and inactive registered accounts. It is not all-time signups; deleted accounts are absent. Auth identity providers linked to the same account count once. Fictional Story Garden examples do not create Auth accounts.

The homepage reads a separate scalar RPC and, per the founder’s copy preference, labels the number “members in community”. The number still counts all Mutu registered accounts, not only Rotman members. Map nodes and community exchange statistics keep their existing scope and permissions; their captions explicitly say “in this community”. No Auth rows, identities or status breakdowns are exposed. Only authenticated callers can request the aggregate.

Fetch on mount, browser focus, visible-page return and every 60 seconds while visible. Late requests cannot replace newer responses. Missing migration or network errors show “Mutu registration total temporarily unavailable”, never 61, zero, or a community count as a substitute. Demo mode says “example members”.

## Install

Founder manually runs scripts/migration-mutu-registration-count.sql, then scripts/verify-mutu-registration-count.sql. The second query returns the expected current homepage number. Deploy the frontend after migration. No production SQL was run by the assistant.

## Verification

Three focused tests cover the global aggregate contract, missing migration/network failure, auth-only execution, protected raw Auth data, anonymous exclusion, deletion and migration repeatability in disposable PGlite. Production build checked separately. Actual Supabase integration awaits founder execution; no live registration count has been read or assumed.

## UX review

Using mutu-behavioral-ux: accurate social proof and clarity reduce confusion. One truthful metric appears without new decisions, nudges or animations. Loading, failure and demo values remain distinct. Returning users see refreshed information. Success means the figure matches the declared registration definition, not increased screen time. Existing map privacy, relationship criteria, feature flags and community eligibility are unchanged.
