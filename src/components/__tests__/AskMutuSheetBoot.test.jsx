// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// The sheet reaches for auth and the network as soon as it opens. This
// test is not about any of that: it is about the module LOADING and the
// component RENDERING at all.
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ profile: null }) }))

afterEach(cleanup)

// A blank production site, caused by `const qPrep = (title) > \`...\`` — a
// mangled arrow function that threw "title is not defined" the moment the
// module was evaluated, before React rendered anything. The build did not
// catch it (bundling never runs top-level code) and no test imported this
// file, so it shipped. Importing the module is the whole point here.
it('loads without evaluating anything undefined at module scope', async () => {
  const mod = await import('../AskMutuSheet')
  expect(typeof mod.default).toBe('function')
})

it('renders closed without crashing', async () => {
  const AskMutuSheet = (await import('../AskMutuSheet')).default
  render(<AskMutuSheet open={false} userId="me" onClose={() => {}} />)
  expect(document.body).toBeTruthy()
})

it('renders open without crashing, and shows the interview shortcuts', async () => {
  const AskMutuSheet = (await import('../AskMutuSheet')).default
  render(<AskMutuSheet open userId="me" onClose={() => {}} />)
  expect(screen.getByRole('button', { name: /Practise/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'What should I practise next?' })).toBeTruthy()
})
