-- ============================================================
-- Mutu — an invitation was sent but the other person sees nothing
--
-- READ ONLY. Every statement is a SELECT. Nothing is written.
-- Safe to run in the Supabase SQL Editor on production.
--
-- The pool is ANONYMOUS: the sender invites a REQUEST, not a person,
-- so the first thing to establish is who the invitation actually
-- went to. Section B answers that.
-- ============================================================

WITH me AS (
  SELECT id, name, email, access_status
    FROM public.profiles
   WHERE lower(email) = 'erminelyu@gmail.com'
),
them AS (
  SELECT id, name, email, access_status
    FROM public.profiles
   WHERE lower(email) = 'xiaoling.lyu@mail.utoronto.ca'
),

-- ── A. Do both accounts exist and are they eligible? ─────────────
a AS (
  SELECT 'A. account' AS section,
         p.name       AS who,
         p.email      AS detail_1,
         p.access_status AS detail_2,
         coalesce((SELECT string_agg(cm.status, ', ')
                     FROM public.community_members cm
                    WHERE cm.user_id = p.id), 'NO MEMBERSHIP ROW') AS detail_3,
         NULL::timestamptz AS at
    FROM (SELECT * FROM me UNION ALL SELECT * FROM them) p
),

-- ── B. Pending invitations SENT by erminelyu, and to WHOM ────────
-- If the addressee here is not Serine, the invitation simply went to
-- a different member: the browse surface never names the owner.
b AS (
  SELECT 'B. invitation sent' AS section,
         coalesce(adr.name, '(unknown)') AS who,
         coalesce(adr.email, '(unknown)') AS detail_1,
         pp.status AS detail_2,
         'expires ' || pp.expires_at::date::text AS detail_3,
         pp.invited_at AS at
    FROM public.practice_pairings pp
    JOIN me ON me.id = pp.requester_user_id
    LEFT JOIN public.profiles adr ON adr.id = pp.addressee_user_id
   WHERE pp.status = 'invited'
),

-- ── C. Every pairing row Serine is part of, either direction ─────
c AS (
  SELECT 'C. Serine pairing' AS section,
         CASE WHEN pp.addressee_user_id = them.id
              THEN 'incoming, from ' || coalesce(req.name, '(unknown)')
              ELSE 'outgoing, to ' || coalesce(adr.name, '(unknown)') END AS who,
         pp.status AS detail_1,
         CASE WHEN pp.addressee_user_id = them.id
              THEN 'she should SEE this in My Sessions'
              ELSE 'she sent it' END AS detail_2,
         'expires ' || pp.expires_at::date::text AS detail_3,
         pp.invited_at AS at
    FROM public.practice_pairings pp
    JOIN them ON them.id IN (pp.requester_user_id, pp.addressee_user_id)
    LEFT JOIN public.profiles req ON req.id = pp.requester_user_id
    LEFT JOIN public.profiles adr ON adr.id = pp.addressee_user_id
),

-- ── D. Did Serine actually get an invitation notification? ───────
d AS (
  SELECT 'D. her notification' AS section,
         n.title AS who,
         n.type  AS detail_1,
         CASE WHEN n.read_at IS NULL THEN 'UNREAD' ELSE 'read' END AS detail_2,
         'pairing ' || coalesce(n.payload->>'pairing_id', '(none)') AS detail_3,
         n.created_at AS at
    FROM public.notifications n
    JOIN them ON them.id = n.user_id
   WHERE n.type LIKE 'practice_%'
),

-- ── E. Is Serine even findable? (an invitation needs a request) ──
e AS (
  SELECT 'E. her request' AS section,
         coalesce(r.status, 'NO REQUEST ROW') AS who,
         coalesce(r.want_types::text, '-')    AS detail_1,
         coalesce(r.help_types::text, '-')    AS detail_2,
         r.community_id::text                 AS detail_3,
         r.updated_at                         AS at
    FROM them
    LEFT JOIN public.practice_requests r ON r.user_id = them.id
)

SELECT section, who, detail_1, detail_2, detail_3, at
  FROM (
    SELECT * FROM a UNION ALL SELECT * FROM b UNION ALL
    SELECT * FROM c UNION ALL SELECT * FROM d UNION ALL SELECT * FROM e
  ) x
 ORDER BY section, at DESC NULLS LAST;

-- ============================================================
-- Reading it
--
--  B shows an addressee who is NOT Serine
--     → the invitation went to someone else. The pool is anonymous,
--       so the sender picks a REQUEST, never a person. Nothing is
--       broken; Serine was simply not the recipient.
--
--  B is empty
--     → erminelyu has no pending invitation at all, and the screen
--       in the app is stale. Pull to refresh / reload.
--
--  C shows an 'invited' row where she is the addressee, AND
--  D shows a matching 'practice_invitation' notification
--     → the data is correct and the invitation is waiting for her in
--       Together, My Sessions, under "To do". Check she is signed in
--       as this account and that Together is visible to her.
--
--  C shows the row but D has no matching notification
--     → the notification insert did not happen. Report that: it is a
--       real defect, since both are written in one transaction.
--
--  E shows NO REQUEST ROW or a non-active status
--     → she was not in the pool, so she could not have been the
--       target of an invitation in the first place.
-- ============================================================
