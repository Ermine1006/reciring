-- ReciRing / Mutu — Recognition · Slice 4 (trust signal)
--
-- A coarse, non-identifying trust signal per user, for the anonymous match
-- card. A user "qualifies" once ≥3 DISTINCT people have recognized them
-- (≥3 recognitions from ≥3 distinct givers).
--
-- The view exposes ONLY user_id + recognizer_count + qualified — never chips,
-- free_text, or exchange counts. It is owner-rights (not security_invoker), so
-- it aggregates across all recognition_events (bypassing the giver-only base
-- RLS) but reveals only the coarse aggregate. Any authenticated member may
-- read it (needed to render the signal for peers surfaced in their feed);
-- there is nothing finer-grained to leak.
-- ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.trust_signal;
CREATE VIEW public.trust_signal AS
  SELECT
    receiver_id                         AS user_id,
    count(DISTINCT giver_id)::int       AS recognizer_count,
    (count(DISTINCT giver_id) >= 3)     AS qualified
  FROM public.recognition_events
  GROUP BY receiver_id;

GRANT SELECT ON public.trust_signal TO authenticated;
