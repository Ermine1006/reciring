-- Read receipts for match chat (WhatsApp-style ✓✓).
--
-- read_at = when the RECIPIENT first read the message. The sender's client
-- shows a single tick once sent and a coloured double tick once read_at is set.
-- The recipient sets it via the existing "Participants can update messages in
-- own matches" UPDATE policy — no new policy needed. The change rides the
-- existing realtime messages-UPDATE subscription, so the sender sees it live.
--
-- Nullable, no backfill (old messages simply have no read state). Re-runnable.

alter table public.messages
  add column if not exists read_at timestamptz;

-- Speeds up "mark everything the peer sent as read".
create index if not exists idx_messages_unread
  on public.messages (match_id, read_at);
