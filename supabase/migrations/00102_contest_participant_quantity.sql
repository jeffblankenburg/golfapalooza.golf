-- Add quantity to financial_contest_participants
-- Allows a participant to have multiple entries (e.g., 4 squares in Super Bowl Squares)
-- Entry fee charge = quantity * contest entry_fee

ALTER TABLE public.financial_contest_participants
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;
