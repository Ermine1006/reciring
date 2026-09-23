# Together illustration and typography

Buddy now has its own campus walk illustration, separate from Practice's seated
conversation art. Built-in image generation prompt: square cozy pixel art of two
MBA buddies walking through a leafy university courtyard, backpacks, one pointing
toward the entrance, matcha/ivory/gold palette, no desk, laptop, lettering or UI.
Web asset: `public/illustrations/buddy-campus-walk.webp`.

Follow-up: the active asset is now `public/illustrations/buddy-campus-pixel.webp`.
It was generated with `public/pixel-glass/together.png` as an explicit style
reference: match the stepped outlines, chunky pixel grid, simplified characters,
ivy, white flowers, lantern and cream/matcha palette; two buddies with a campus map,
no table or laptop. This keeps a distinct Buddy scene within the existing art set.
The original asset is retained but no longer referenced by the entry card.

All Together, Buddy and Story Garden text elements and form controls now use the
same font family, including legacy inline declarations. The three connection card
titles share 16px/650, body 12px/400, buttons 13px/650, with consistent line heights.

The user wants calmer, more consistent section titles. The heading stack uses
Avenir Next where installed, then rounded/system sans serif fallbacks. Story
Garden entry/page headings, Buddy headings and Together feature card titles share
moderate sizes and semibold weight. No font download is required. Body text and
story content are preserved. Exact letterforms depend on the device's fonts.

Ease and clear identity are the design goals: distinguish the two activities at
a glance and make the hierarchy easier to scan. Existing buttons, routes, consent,
data, loading and empty states remain unchanged. No new engagement mechanics or
metrics; useful connections remain the goal. This is a visual change only, with
no database migration. Review narrow/mobile layouts before release.
