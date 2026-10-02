-- 00260_v2_option_allow_none.sql
-- Configurable "I'm not having any" opt-out for options (v1's beer case, but authored,
-- not hardcoded). When `allow_none` is on, the member control shows an explicit opt-out
-- that records an answered-but-empty selection (satisfies a required option at $0). The
-- label is admin-authored (`none_label`), defaulting to "I'm not having any" when blank.
-- Currently surfaced on quantity options (where v1 used it); the columns are generic.

ALTER TABLE public.v2_options
  ADD COLUMN IF NOT EXISTS allow_none BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS none_label TEXT;
