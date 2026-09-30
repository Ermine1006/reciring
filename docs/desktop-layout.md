# Desktop web layout

The existing 390 × 844 phone frame made desktop reading and conversation switching unnecessarily difficult. Members need to find a relevant opportunity, reply and arrange time together comfortably on a PC. The barrier is extra navigation and cramped content, rather than a lack of features.

The design uses ease (persistent navigation, shared state across screen sizes) and agency (visible current destination, keyboard access, independent conversation scrolling). Useful discovery remains curated by the existing data. Earned identity, relationship value, curiosity and social proof require no new mechanisms in this layout.

## Flow and hierarchy

Open a destination from the left navigation, inspect its content and use its existing primary action. Home has a greeting, community content and a secondary area for connections and assistance. Messages places the existing conversation list beside the current conversation. Choosing a peer never changes identity visibility or creates a conversation.

New copy: “Skip to content”, “Your conversations”, and “Choose a conversation to read, reply or plan a time together.” Existing navigation labels and “Ask Mutu” are reused.

Below 640px the app fills the phone viewport. Tablets retain bottom navigation. At 1024px navigation moves left and conversations split into two panels. At 1280px Home and the Together pathways use two columns. Reading pages have a bounded line length. Height follows the browser window; each screen owns its scrolling, and input remains outside the message scroller. No additional motion is introduced; keyboard focus stays visible and existing reduced-motion behavior remains available.

## States and safeguards

The existing empty conversation list explains how to connect. With no selected conversation, the desktop detail panel explains the next action; mobile shows only the list. Existing loading, errors, retries, success confirmations and post completion states remain within their original screens. One responsive DOM tree preserves component state when resizing. Message and peer-profile state is scoped to the current conversation; late fetch, send and receipt results cannot populate another conversation. The Active/Past list stays mounted when a conversation is opened.

This is a layout-only change. Data queries, feature flag defaults, anonymous and real-name rules, mutual identity consent, community boundaries, message delivery, Buddy permissions, SQL and native platform configuration are unchanged. No production data is needed for layout checks.

The value loop is an existing invitation or relevant opportunity → respond or arrange a session → useful mutual exchange → verified relationship history → a natural follow-up. Evaluate through successful replies, scheduled sessions and mutually verified exchanges, not time spent on the site.

## Validation

Build the production bundle; run layout interaction tests and existing Ask Mutu tests. Visually check Home, Give & Ask, Together, Messages and the assistant at desktop and mobile widths. Use synthetic local conversations to check independent scrolling, keyboard selection, current-row highlighting and retaining a typed draft across viewport changes. Never send test messages to real members.

Validated at 1440 × 900, 1024 × 768, 768 × 1024 and 390 × 844. There was no document-level horizontal overflow in the measured tablet, phone or small desktop layouts; the composer stayed visible and the typed draft survived resizing. Keyboard activation opened an anonymous synthetic conversation. Production build passed. Full suite: 568 passed, 8 existing failures in practice taxonomy/preferences/recommendations/quest and Buddy year-edit tests. The five new navigation, filter-retention and conversation-isolation tests passed.

## Optional website view

The login page and signed-in header expose “View” with “Auto”, “Mobile” and “PC”. Auto uses the breakpoints above; Mobile caps the shell at 430px with bottom navigation; PC retains a minimum 1024px workspace with horizontal panning on smaller devices. The header control remains reachable while panning. The underlying screens stay mounted when choosing a mode, so signing in again is unnecessary and drafts remain intact.

This small control supports agency and ease: choose once, continue the current action, and return to the preferred layout next visit. The validated preference is stored only in this browser, with Auto as the default. Invalid or unavailable storage falls back safely, and blocked storage still permits a change for the current visit. No account, privacy, sharing, feature flag or data-access rules change. Native app shells retain automatic sizing and do not show the selector.
