// HMAC-signed unsubscribe tokens.
//
// Token format:  `${userId}.${hmacHex32}`
// Secret:        process.env.SUPABASE_SERVICE_ROLE_KEY (server-only, never bundled)
//
// Why HMAC over JWT: we don't need an expiry — an unsubscribe link
// should work forever. HMAC is also simpler and has no library cost.
// The same secret powers all tokens; rotating it invalidates every
// outstanding link (acceptable for an unsubscribe path).

import crypto from 'node:crypto'

const TOKEN_LEN = 32  // hex chars

export function makeUnsubscribeToken(userId, secret) {
  if (!userId || !secret) throw new Error('makeUnsubscribeToken: missing userId or secret')
  const hmac = crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, TOKEN_LEN)
  return `${userId}.${hmac}`
}

export function verifyUnsubscribeToken(token, secret) {
  if (!token || typeof token !== 'string' || !secret) return null
  const idx = token.lastIndexOf('.')
  if (idx <= 0) return null
  const userId = token.slice(0, idx)
  const provided = token.slice(idx + 1)
  if (provided.length !== TOKEN_LEN) return null
  const expected = crypto.createHmac('sha256', secret).update(userId).digest('hex').slice(0, TOKEN_LEN)
  try {
    if (crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))) {
      return userId
    }
  } catch {
    return null
  }
  return null
}
