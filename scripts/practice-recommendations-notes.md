# Practice Quest recommendations

## Activation

The founder runs `migration-practice-recommendations.sql` in Supabase SQL Editor. It is transactional and rerunnable. Requires the existing practice request, pairing and eligible anonymous browse functions. It does not modify existing posts, pairings, feedback, tokens or profiles.

Until this migration is applied the client uses the existing browse RPC, labels the list as matches by practice type, and does not fabricate skill or response data.

## Member experience

Open Together, Practice Quest, Find your teammate, Personalise my recommendations. Choose up to three private focus skills and three skills you feel strong in. Saving support skills explicitly shares them on the anonymous card as **self selected**, not peer verified. Optional response sharing defaults off and can be revoked by saving again.

Recent unreported feedback from mutually verified sessions suggests a private next focus. The recipient must choose and save it before it affects matching. Notes, feedback authors, and another person's private focus never enter browse responses. This is deterministic recommendation logic, not an AI rating.

Existing category fit, community eligibility, blocks, live invitation exclusion, decline cooldown and mutual identity reveal are preserved. The server ranks matching support skills first and similar response habits second. Unknown response history is neutral and never excludes a member. After mutual acceptance, Open Messages still opens the platform's existing thread.

Response evidence uses invitations received in the same community during the last 90 days, with at least 48 hours elapsed. Withdrawn invitations are excluded. The latest eligible invitation from each sender counts once; at least three distinct senders are required. Accepting or declining within 48 hours counts as a response. Similarity is considered only when both people opt in and have sufficient records. It describes responses to invitations, not chat messages.

## Verification

Automated SQL tests exercise actual anonymous browse rules, ranking, opt out, insufficient samples, category changes, helper/table access denial and absence of member IDs or private focus. UI tests cover evidence, no-history states, explicit feedback selection, invitation actions and the existing message route. API tests cover migration compatibility and real error propagation. A real-device visual review remains necessary.

Success measures: invitations accepted, sessions scheduled, exchanges mutually verified, and repeat practice. No public leaderboard or compatibility percentage.

## Rollback

Drop only `public.browse_practice_recommendations(uuid)` to restore legacy browse through the client fallback. Saved private preferences can remain; no existing session or invitation changes need reversing.
