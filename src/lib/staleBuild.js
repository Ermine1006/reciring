// ── Recovering from a tab that is running the previous build ──────
//
// Every deploy gives the chunks new hashed filenames. A tab that was
// open across a deploy still holds the old app shell, so the moment it
// lazily loads a screen it asks for a chunk that is no longer there and
// the import fails. The member sees "Something went wrong" on a feature
// that works perfectly well; they did nothing wrong and there is
// nothing to fix except being on yesterday's page.
//
// One reload picks up the new shell. The guard caps that at ONE per tab
// session: if a reload does not fix it, the cause is not a stale build
// and looping would hide the real error behind a flickering page.

const KEY = 'mutu_reloaded_for_stale_build'

/** Does this error mean "the file my page asked for is not there"? */
export function isStaleBuildError(error) {
  const message = String(error?.message || error || '')
  return /Failed to fetch dynamically imported module/i.test(message)
    || /Importing a module script failed/i.test(message)
    || /error loading dynamically imported module/i.test(message)
}

function alreadyReloaded(storage) {
  try { return storage?.getItem(KEY) === '1' } catch { return false }
}

function markReloaded(storage) {
  try { storage?.setItem(KEY, '1') } catch { /* private mode: cap becomes best effort */ }
}

/**
 * Reload once for a stale build. Returns true when it acted, so callers
 * can keep showing their own error UI when it did not.
 */
export function reloadForStaleBuild({ storage, reload } = {}) {
  const store = storage ?? (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  const doReload = reload ?? (() => window.location.reload())
  if (alreadyReloaded(store)) return false
  markReloaded(store)
  doReload()
  return true
}

/** Listen for Vite's own signal that a chunk could not be preloaded. */
export function watchForStaleBuild(target = typeof window !== 'undefined' ? window : null, options = {}) {
  if (!target?.addEventListener) return () => {}
  const onPreloadError = (event) => {
    // Taking over means Vite does not also throw it at the page.
    if (reloadForStaleBuild(options)) event?.preventDefault?.()
  }
  target.addEventListener('vite:preloadError', onPreloadError)
  return () => target.removeEventListener('vite:preloadError', onPreloadError)
}
