-- ============================================================
-- ReciRing: matches + messages schema, RLS, profile trigger
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- ── 1. Profile auto-create trigger ─────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, is_anonymous)
  VALUES (NEW.id, NEW.email, 'Anonymous', true)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 2. Matches table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.matches (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id          uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL,   -- the person who created the post
  helper_user_id    uuid NOT NULL,   -- the person who picked it up
  status           text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','completed','cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- prevent the same helper picking up the same post twice
  UNIQUE (post_id, helper_user_id)
);

-- Index for fast lookups by either participant
CREATE INDEX IF NOT EXISTS idx_matches_requester ON public.matches (requester_user_id);
CREATE INDEX IF NOT EXISTS idx_matches_helper    ON public.matches (helper_user_id);


-- ── 3. Messages table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id        uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_user_id  uuid NOT NULL,
  body            text NOT NULL DEFAULT '',
  type            text NOT NULL DEFAULT 'text'
                    CHECK (type IN ('text','meeting_proposal','system')),
  metadata        jsonb,            -- for meeting data: {datetime, location, status}
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_match ON public.messages (match_id, created_at);


-- ── 4. RLS policies ────────────────────────────────────────

-- Matches
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Users can see matches they are part of
CREATE POLICY "Users can view own matches"
  ON public.matches FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_user_id OR auth.uid() = helper_user_id);

-- Only the helper creates the match (they are the one swiping / picking up)
CREATE POLICY "Helper can create match"
  ON public.matches FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = helper_user_id);

-- Either participant can update status (e.g. cancel, complete)
CREATE POLICY "Participants can update match"
  ON public.matches FOR UPDATE
  TO authenticated
  USING (auth.uid() = requester_user_id OR auth.uid() = helper_user_id);

-- Messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages for matches they belong to
CREATE POLICY "Users can view messages in own matches"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND (m.requester_user_id = auth.uid() OR m.helper_user_id = auth.uid())
    )
  );

-- Users can send messages in matches they belong to
CREATE POLICY "Users can insert messages in own matches"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_user_id
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND (m.requester_user_id = auth.uid() OR m.helper_user_id = auth.uid())
    )
  );

-- Allow updating meeting metadata (confirm / reschedule)
CREATE POLICY "Participants can update messages in own matches"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND (m.requester_user_id = auth.uid() OR m.helper_user_id = auth.uid())
    )
  );


-- ── 5. Ensure profiles RLS is complete ─────────────────────
-- (safe to re-run — CREATE POLICY will error if duplicate name,
--  so these use IF NOT EXISTS via DO blocks)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Profiles are viewable by authenticated users') THEN
    EXECUTE 'CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can insert their own profile') THEN
    EXECUTE 'CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can update their own profile') THEN
    EXECUTE 'CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can delete their own profile') THEN
    EXECUTE 'CREATE POLICY "Users can delete their own profile" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id)';
  END IF;
END $$;
