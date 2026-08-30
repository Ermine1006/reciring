# Practice pilot — manual two-account end-to-end checklist

**Accounts:** two real, active Mutu accounts that are Rotman community members (any two of the 43 backfilled accounts — e.g. your own two emails). Call them **A** and **B**. No special test data is needed; the flow itself creates real rows, so use accounts you're happy to have practice history on (everything can be left in place — or removed later by you in the SQL Editor).

**Devices:** two browsers/devices (or one browser + one private window), each signed into one account. On **each** device, open the browser console and run `localStorage.setItem('mutu_practice','on')`, then reload. (`localStorage.removeItem('mutu_practice')` turns it back off.)

Work down the list in order — later steps depend on earlier ones.

## 1 · Flag & navigation
- [ ] With the flag OFF (default): bottom bar is unchanged (Home · Discover · **Post** · Matches · Events); nothing Practice-related appears anywhere.
- [ ] With the flag ON: bottom bar shows Home · Discover · **Practice** · Matches · Events; tab bar doesn't wrap on the narrowest device you have (iPhone SE width if possible).
- [ ] Discover now shows a round green **+** button (bottom-right); tapping it opens the old Post screen (Create request / My posts) unchanged.

## 2 · Request creation (both accounts)
- [ ] A: Practice → My request + → pick want (e.g. **Case**), help (e.g. **Behavioural**), add focus text, ≥1 future availability window, save. Confirmation banner appears; "My request" now shows the live summary.
- [ ] Try saving with no help types → blocked with a clear message (two-way rule).
- [ ] Try adding a second active request (edit is fine; there's no UI path to a second one — just confirm Edit updates in place).
- [ ] B: create the **mirror** request (want Behavioural, help Case) with a window overlapping A's.

## 3 · Anonymous browse (Stage A)
- [ ] B: Partners tab shows A's card: bean avatar, "Anonymous Rotman member", **both-direction fit sentences**, exact availability windows with a timezone label (e.g. "… EDT"), format + duration. **No name, no photo anywhere.**
- [ ] A's own card does **not** appear to A.
- [ ] A: pause or withdraw the request → B refreshes Partners → A's card disappears. Re-activate (re-publish) → it returns.

## 4 · Invitation (still anonymous)
- [ ] B: tap **Invite to practise** on A's card → banner confirms; card leaves B's Partners list; Invites shows it under "Sent by you" with days-left.
- [ ] A: bell notification "New practice invitation" appears (generic — **no name in it**). Invites tab shows it under "For you": B's want/help summary, bean avatar, **no identity**.
- [ ] B: tap Invite again from a stale tab if you can → clean "already an invitation" message, no duplicate.
- [ ] (Optional) Decline path: A declines → invitation disappears both sides; B's Partners no longer shows A (30-day cooldown). To continue testing, A re-publishes nothing — instead B re-invites is blocked; so for the main flow, **use Accept below** (run the decline test with a third account later, or accept a fresh invitation after checking).

## 5 · Acceptance = mutual match + reveal
- [ ] A: tap **Accept & reveal identities** → lands on the pairing detail: B's **real name and avatar** now visible, "identities revealed".
- [ ] B: refresh → same pairing shows A's real name.
- [ ] Matches tab (both): a **new** conversation with the other person, badged **Practice**; opening it shows the "Practice partners" context card and the name in the header — with **no** identity-reveal request UI.
- [ ] If A and B already had an older (anonymous) chat: it is **still there, still anonymous, unchanged** — two separate conversations coexist.

## 6 · Mutual scheduling (propose → confirm)
- [ ] A (or B): pairing detail → "You're both free" suggestions reflect overlapping windows → propose a time (tap a suggestion to prefill), duration, virtual + link → partner gets a "Practice time proposed" notification.
- [ ] Proposer sees "Time proposed — waiting" and can only **withdraw**; the other side sees **Confirm / Suggest another time**.
- [ ] Proposer cannot confirm their own proposal (no button; the RPC would refuse anyway).
- [ ] Other side confirms → both see **Scheduled** with the time in an explicit timezone + the six-line two-round agenda.
- [ ] (Optional) Cancel test: cancel a scheduled session → partner notified; pairing returns to "Pick a time"; propose again.

## 7 · Two-sided completion → shared token
- [ ] Before the scheduled start time: the confirm card does **not** appear (state stays "Scheduled"). For testing, schedule a session a few minutes ahead and wait for the start to pass.
- [ ] After start: both sides see **Confirm your session**. A submits "It happened" — must tick **both** boxes (own round + partner's round) or it's blocked.
- [ ] After A submits: A sees "waiting for B"; B still sees the confirm card. **No token yet** (Done tab still empty).
- [ ] A cannot submit twice.
- [ ] B submits "It happened" (both boxes) → state flips to **Verified ✦**; both get the "exchange verified" notification.
- [ ] Done tab (both accounts): **exactly one** shared token — same date, same exchange types, the other person's name. Counts match on both sides.
- [ ] (Optional, second session) Dispute path: schedule and let one confirm "It happened", the other "Someone didn't show" → state becomes "Under review", **no token**, and the row freezes.

## 8 · Regression (flag OFF)
- [ ] Turn the flag off on one device → Post tab returns, Discover has no "+", Practice tab gone; Discover swipe, Matches, existing chats, Events, identity reveal on ordinary matches, and posting all behave exactly as before.
- [ ] The Practice chat created above still appears in Matches (it's a real conversation) — badge and all — which is expected.

## Where to look if something fails
- Friendly error messages come from `practiceErrorMessage` — the raw code (e.g. `no_mutual_fit`) shows in the browser console.
- Funnel events land in `funnel_events` (`practice_*` names, each with `community_id`).
- DB truth: `practice_admin_report` in the SQL Editor gives per-community counts (requests, invitations, pairings, sessions, tokens) to cross-check every step above.
