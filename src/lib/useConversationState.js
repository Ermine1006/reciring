import { useCallback, useRef, useState } from 'react'

// Async work belongs to the conversation that started it. In the desktop
// split view a member can switch peers before a fetch/send/read receipt ends.
export default function useConversationState(scope, initialValue) {
  const initial = useRef(initialValue)
  const current = useRef({ scope, generation: 0 })
  if (current.current.scope !== scope) {
    current.current = { scope, generation: current.current.generation + 1 }
  }
  const generation = current.current.generation
  const [stored, setStored] = useState({ generation, value: initial.current })
  const update = useCallback(value => {
    setStored(previous => {
      if (current.current.generation !== generation) return previous
      const before = previous.generation === generation ? previous.value : initial.current
      return { generation, value: typeof value === 'function' ? value(before) : value }
    })
  }, [generation])
  return [stored.generation === generation ? stored.value : initial.current, update]
}
