-- ============================================================
-- Enable Supabase Realtime for messages and matches tables
-- Run this in the Supabase SQL Editor.
-- Safe to re-run — uses DO blocks to skip if already added.
-- ============================================================

-- Add tables to the realtime publication (skip if already member)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
  END IF;
END $$;

-- REPLICA IDENTITY FULL on messages so that UPDATE payloads include
-- all columns (especially metadata JSONB). Without this, Supabase
-- Realtime UPDATE events may have incomplete/null fields.
ALTER TABLE public.messages REPLICA IDENTITY FULL;
