/**
 * AppScreen — standard screen container for ReciRing.
 *
 * Purpose: stop every page from re-inventing the
 * `flex-1 phone-scroll` + footer + safe-area dance, so layout bugs
 * (input hidden under tab bar, sticky CTA clipped by home indicator)
 * can't sneak back in.
 *
 * Web-native, not a React Native port:
 *   • Safe-area for the home indicator is owned by the phone shell's
 *     bottom <nav> (App.jsx) — every screen sits above it, so a screen
 *     does NOT add safe-area padding to its body. Doing so would
 *     double-pad above the home indicator.
 *   • Keyboard avoidance is handled by the shell using h-[100dvh] —
 *     when iOS opens the keyboard, the dynamic viewport shrinks and
 *     the flex column collapses, keeping the bottom in view.
 *   • The one place safe-area IS needed at the screen level is a
 *     sticky bottom action bar (Submit, Send, Save). Pass it as the
 *     `footer` prop and AppScreen will pin it with the correct inset.
 *
 * Usage:
 *
 *   // Simple scrollable page
 *   <AppScreen>
 *     <YourContent />
 *   </AppScreen>
 *
 *   // Page with sticky CTA (e.g. Save button)
 *   <AppScreen footer={<SaveButton />}>
 *     <YourForm />
 *   </AppScreen>
 *
 *   // Page that handles its own scrolling internally (e.g. a chat
 *   // with messages + input). Disable the wrapper scroll:
 *   <AppScreen scroll={false}>
 *     <ChatLayout />
 *   </AppScreen>
 *
 * NOT migrated (intentional):
 *   • CardStack (Discover) — gesture-driven full-bleed; a scroll
 *     wrapper would interfere with swipes.
 *   • ChatView — already implements messages + input-bar as a flex
 *     column inside `<main>`. Wrapping would be redundant and the
 *     input bar would need to remain the bottom flex sibling.
 *   • ProfilePage — owns its own header + sub-tab body; each sub-tab
 *     can use AppScreen individually if needed.
 */
export default function AppScreen({
  children,
  footer = null,
  scroll = true,
  background = '#F9F7F4',
  className = '',
  style = {},
}) {
  return (
    <div
      className={`flex-1 flex flex-col min-h-0 ${className}`}
      style={{ background, ...style }}
    >
      {scroll ? (
        <div className="flex-1 phone-scroll">
          {children}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {children}
        </div>
      )}

      {footer && (
        // flex-shrink-0 pins the footer above the bottom nav.
        // paddingBottom adds env(safe-area-inset-bottom) so a sticky
        // CTA never sits under the iOS home indicator when this screen
        // is shown without the bottom nav (e.g. inside a modal route).
        // When the nav IS shown below, the nav's own safe-area padding
        // takes precedence; the inset here resolves to 0 because the
        // sticky element is no longer at the viewport bottom.
        <div
          className="flex-shrink-0"
          style={{
            paddingBottom: 'env(safe-area-inset-bottom)',
            background,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  )
}
