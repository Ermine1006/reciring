# Buddy post destinations

A first year student can publish one request to any nonempty combination of My Buddy, Buddy Program and Whole community. The heading is **Where should this appear?** and the hint is **Select any combination · N selected**. Each choice is an independent toggle with a visible checkmark. An empty selection disables publishing and shows **Choose at least one place to publish.** Editing restores all choices, including legacy scalar `audience` values.

The user's job is to ask once and deliberately choose where support can come from. The previous exclusive choice made this confusing. The relevant Mutu motivation lenses are agency (independent, reversible destinations), ease (one draft and one post) and useful discovery (additional selected surfaces). The flow is destination choices, request and anonymity controls, then one publish/save action. Existing calm colors and spacing remain; no new motion, incentives, notifications or sharing defaults are introduced.

The value loop is a need, an intentional request, a relevant offer, a consensual conversation and a useful reason to return. Success means requests reaching intended people, accepted help and completed verified exchanges, rather than page views. The dark-pattern and final quality checks preserve consent, clear recovery and reciprocal language. My Buddies keeps its established real-name relationship; anonymous and real-name community posts keep their existing behavior.

## Routing and privacy

- `buddy_choice_posts.payload.audiences` is the canonical array. Existing scalar rows keep their original visibility through a shared normalizer. Invalid, duplicate and empty selections are rejected on the server.
- My Buddy requires a confirmed, accessible assigned pairing and appears in its student's My Buddies detail.
- Buddy Program requires approved active upper-year membership to browse and offer help. Removing this destination withdraws pending offers; existing conversations survive.
- Whole community has at most one `posts` mirror linked through `buddy_post_id`. Owner edits/removal in Give & Ask use canonical RPCs. Restrictive policies prevent older clients from independently editing mirrors or inserting duplicate mirror conversations.
- Public mirrors enforce community membership, blocks and current visibility. Hidden mirrors are excluded from Home and Give & Ask. Rows needed for conversation history are retained, and adding the destination again reuses that mirror.
- The community connection RPC reuses existing active/completed non-practice conversations without changing identity consent. Buddy acceptance preserves its existing explicit reveal behavior. My Buddies only reuses already revealed conversations, preserving the existing privacy boundary around unrelated anonymous chats.

Loading, server errors and success use existing UI patterns. Missing migration errors preserve the draft and selections. No automatic fallback silently discards destinations. With no confirmed Buddy, that destination explains its availability; an old selected Buddy can still be deselected.

## Deployment

The founder runs SQL manually in Supabase SQL Editor, as required by `AGENTS.md`. After the existing audience-edit, unified-match-chat and assigned-chat migrations, run:

` scripts/migration-buddy-post-multi-audiences.sql `

The migration is transactional and rerunnable. Do not reapply the earlier function-definition migrations afterward. Frontend deployment alone does not install it. Until it is installed, the new multi-destination save endpoints fail clearly and preserve the draft.

## Validation

The new UI, client-routing and local PostgreSQL tests cover all seven nonempty combinations, empty/invalid selections, legacy scalar rows, approved access, blocks, community boundaries, anonymity, public edits/removal, retained conversation history and reuse across community, Buddy Program and assigned Buddy entry points. Migration execution is tested locally with PGlite, including repeated installation; no production SQL is executed.
