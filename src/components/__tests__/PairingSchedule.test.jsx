// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PairingDetail from '../practice/PairingDetail'

afterEach(cleanup)
const pairing = { status: 'accepted', match_id: 'match', my_snapshot: { timezone: 'America/Toronto' } }

it('uses one meeting field and derives both meeting payloads and duration from the choices', () => {
  const propose = vi.fn()
  render(<PairingDetail pairing={pairing} sessionModesSupported onPropose={propose} />)
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.queryByPlaceholderText('Zoom / Meet / Teams link')).toBeNull()
  fireEvent.change(screen.getByLabelText('Practice date'), { target: { value: '2099-09-24' } })
  fireEvent.change(screen.getByLabelText('Practice time'), { target: { value: '18:00' } })
  fireEvent.click(screen.getByRole('button', { name: /Full Mock Swap/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Case interview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Zoom' }))
  expect(document.querySelectorAll('input[type="url"]')).toHaveLength(1)
  fireEvent.change(screen.getByLabelText('Zoom meeting link'), { target: { value: 'https://zoom.us/j/123' } })
  fireEvent.click(screen.getByRole('button', { name: /Propose this time/ }))
  expect(propose).toHaveBeenLastCalledWith(expect.objectContaining({
    meetingMethod: 'zoom', meetingUrl: 'https://zoom.us/j/123',
    locationType: 'virtual', locationDetail: 'https://zoom.us/j/123', durationMinutes: 75,
  }))
  fireEvent.click(screen.getByRole('button', { name: 'In person' }))
  fireEvent.change(screen.getByLabelText(/Meeting location/), { target: { value: 'Rotman library' } })
  fireEvent.click(screen.getByRole('button', { name: /Propose this time/ }))
  expect(propose).toHaveBeenLastCalledWith(expect.objectContaining({
    meetingMethod: 'in_person', meetingUrl: '', meetingLocation: 'Rotman library',
    locationType: 'in_person', locationDetail: 'Rotman library',
  }))
})

it('retains duration selection when practice modes are unavailable', () => {
  render(<PairingDetail pairing={pairing} />)
  expect(screen.getByRole('combobox', { name: 'Duration' })).toBeTruthy()
  expect(screen.queryByPlaceholderText('Zoom / Meet / Teams link')).toBeNull()
})
