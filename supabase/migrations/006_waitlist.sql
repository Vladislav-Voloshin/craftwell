-- Migration 006: Create waitlist table for early-access signups (PB-173)
-- Idempotent: table and index use IF NOT EXISTS guards.

CREATE TABLE IF NOT EXISTS public.waitlist (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT        NOT NULL,
  name        TEXT,
  source      TEXT        NOT NULL DEFAULT 'landing_page',
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected', 'invited')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate signups by email
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_idx ON public.waitlist (email);

-- Index for admin queries (filter by status or sort by created_at)
CREATE INDEX IF NOT EXISTS waitlist_status_created_idx ON public.waitlist (status, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Anonymous and authenticated users can sign up (insert only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'waitlist' AND policyname = 'waitlist_insert_public'
  ) THEN
    CREATE POLICY "waitlist_insert_public" ON public.waitlist
      FOR INSERT TO anon, authenticated
      WITH CHECK (true);
  END IF;
END;
$$;

-- Authenticated users can check whether their own email is on the list
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'waitlist' AND policyname = 'waitlist_select_own'
  ) THEN
    CREATE POLICY "waitlist_select_own" ON public.waitlist
      FOR SELECT TO authenticated
      USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
  END IF;
END;
$$;

-- Trigger: keep updated_at current on any row update
CREATE OR REPLACE FUNCTION public.set_waitlist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS waitlist_set_updated_at ON public.waitlist;
CREATE TRIGGER waitlist_set_updated_at
  BEFORE UPDATE ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION public.set_waitlist_updated_at();

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
