import { useCallback, useRef, useState } from 'react'

// A screen can temporarily protect authored text during real tab changes.
// Dismissing a notification or other unrelated button is unaffected.
export default function useGuardedTab(initialTab) {
  const [tab, setValue] = useState(initialTab)
  const current = useRef(tab)
  const guard = useRef(null)
  current.current = tab
  const setTab = useCallback(next => {
    const target = typeof next === 'function' ? next(current.current) : next
    if (target === current.current) return
    const proceed = () => setValue(target)
    if (guard.current) guard.current(proceed)
    else proceed()
  }, [])
  const registerNavigationGuard = useCallback(handler => {
    guard.current = handler
    return () => { if (guard.current === handler) guard.current = null }
  }, [])
  return [tab, setTab, registerNavigationGuard]
}
