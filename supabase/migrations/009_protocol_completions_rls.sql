-- Enable Row Level Security on protocol_completions table.
-- Previously missing — completions were only protected by API-level user_id checks.
-- This migration adds defense-in-depth via Supabase RLS policies.

ALTER TABLE public.protocol_completions ENABLE ROW LEVEL SECURITY;

-- Users can read only their own completions
CREATE POLICY "Users can read own completions"
  ON public.protocol_completions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert completions for themselves only
CREATE POLICY "Users can insert own completions"
  ON public.protocol_completions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own completions (for toggle-off)
CREATE POLICY "Users can delete own completions"
  ON public.protocol_completions
  FOR DELETE
  USING (auth.uid() = user_id);
