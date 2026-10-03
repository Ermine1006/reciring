// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const auth = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithApple: vi.fn(),
  resetPassword: vi.fn(),
  verifyRecoveryCode: vi.fn(),
  resendConfirmation: vi.fn(),
  accessDenied: null,
  clearAccessDenied: vi.fn(),
}))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../lib/platform', () => ({
  isNativeApp: false,
  authRedirect: p => `https://reciring.com${p}`,
  emailRedirect: p => `https://reciring.com${p}`,
}))
import LoginScreen from '../LoginScreen'

// The pill toggle and the submit button share the label "Sign in"; the
// submit is the last one in the form.
const submitButton = () => {
  const all = screen.getAllByRole('button', { name: /^sign in$/i })
  return all[all.length - 1]
}

const typeEmail = () => {
  const field = screen.getAllByPlaceholderText(/utoronto\.ca/i)[0]
  fireEvent.change(field, { target: { value: 'student@rotman.utoronto.ca' } })
  const password = screen.getAllByPlaceholderText(/password|••/i)[0]
  fireEvent.change(password, { target: { value: 'secret123' } })
}

afterEach(cleanup)
beforeEach(() => { vi.clearAllMocks(); auth.resendConfirmation.mockResolvedValue({ error: null }) })

it('offers the confirmation email again when sign in says the address is unconfirmed', async () => {
  auth.signIn.mockResolvedValue({ data: null, error: new Error('Email not confirmed') })
  render(<LoginScreen />)
  typeEmail()
  fireEvent.click(submitButton())
  const resend = await screen.findByRole('button', { name: /send the confirmation email again/i })
  fireEvent.click(resend)
  await waitFor(() => expect(auth.resendConfirmation).toHaveBeenCalledWith('student@rotman.utoronto.ca'))
  expect(await screen.findByText(/open the link in that email/i)).toBeTruthy()
})

it('asks the person to wait when the server is rate limiting', async () => {
  auth.signIn.mockResolvedValue({ data: null, error: new Error('Email not confirmed') })
  auth.resendConfirmation.mockResolvedValue({ error: new Error('For security purposes, you can only request this after 48 seconds.') })
  render(<LoginScreen />)
  typeEmail()
  fireEvent.click(submitButton())
  fireEvent.click(await screen.findByRole('button', { name: /send the confirmation email again/i }))
  expect(await screen.findByText(/give it a minute/i)).toBeTruthy()
})

it('stays hidden until an unconfirmed account is the reason', () => {
  render(<LoginScreen />)
  expect(screen.queryByRole('button', { name: /send the confirmation email again/i })).toBe(null)
})