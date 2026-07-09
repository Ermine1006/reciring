-- ============================================================
-- Mutu MVP: seed the LAUNCH-2026 invite code
--
-- Run AFTER scripts/migration-access-codes.sql. Idempotent — safe
-- to re-run; the ON CONFLICT clause leaves an existing code alone.
--
-- MVP scope: invite-only. Referral codes are supported by the
-- schema but are not being handed out to end users yet.
--
-- After running, verify with:
--   select code, code_type, status, max_uses, used_count, expires_at
--     from public.access_codes
--    where code = 'LAUNCH-2026';
-- ============================================================

insert into public.access_codes (
  code,           -- what a user types
  code_type,      -- 'invite' | 'referral' | 'premium'
  status,         -- 'active' → usable
  max_uses,       -- how many first-time signups can share it
  used_count,     -- starts at 0
  expires_at      -- null = never expires
)
values (
  'LAUNCH-2026',
  'invite',
  'active',
  100,            -- generous for beta; tighten later
  0,
  now() + interval '365 days'
)
on conflict (code) do nothing;
