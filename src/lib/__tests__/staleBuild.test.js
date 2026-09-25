import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isStaleBuildError, reloadForStaleBuild, watchForStaleBuild } from '../staleBuild'

function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  }
}

// The failure a member actually sees after a deploy:
// "Failed to fetch dynamically imported module: .../BuddyChoiceProgram-UfOgmOQY.js"
describe('recognising a stale build', () => {
  it('knows the import failures a deploy causes', () => {
    expect(isStaleBuildError(new Error('Failed to fetch dynamically imported module: https://reciring.com/assets/BuddyChoiceProgram-UfOgmOQY.js'))).toBe(true)
    expect(isStaleBuildError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isStaleBuildError('error loading dynamically imported module')).toBe(true)
  })

  it('does not mistake an ordinary crash for one', () => {
    expect(isStaleBuildError(new Error('title is not defined'))).toBe(false)
    expect(isStaleBuildError(new TypeError('Cannot read properties of null'))).toBe(false)
    expect(isStaleBuildError(null)).toBe(false)
  })
})

describe('reloading for a stale build', () => {
  let storage, reload
  beforeEach(() => { storage = fakeStorage(); reload = vi.fn() })

  it('reloads once, and never again in the same tab', () => {
    expect(reloadForStaleBuild({ storage, reload })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)

    // A second failure means reloading did not help, so looping would
    // only hide the real error behind a flickering page.
    expect(reloadForStaleBuild({ storage, reload })).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('still reloads when the browser refuses storage', () => {
    const blocked = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(reloadForStaleBuild({ storage: blocked, reload })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('watching for the preload failure', () => {
  it('takes over the event so the page is not shown the error too', () => {
    const listeners = {}
    const target = {
      addEventListener: (name, fn) => { listeners[name] = fn },
      removeEventListener: (name) => { delete listeners[name] },
    }
    const stop = watchForStaleBuild(target, { storage: fakeStorage(), reload: vi.fn() })
    expect(typeof listeners['vite:preloadError']).toBe('function')

    const event = { preventDefault: vi.fn() }
    listeners['vite:preloadError'](event)
    expect(event.preventDefault).toHaveBeenCalled()

    stop()
    expect(listeners['vite:preloadError']).toBeUndefined()
  })

  it('does nothing where there is no window to listen on', () => {
    expect(() => watchForStaleBuild(null, {})()).not.toThrow()
  })
})
