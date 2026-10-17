-- Payout note (#230). When an admin marks a member paid, they can jot how it was
-- settled ("Venmo", "cash at the lodge", "mailed check") so it isn't a mystery
-- later. Auto-filled to "Paid via Venmo/PayPal" when they tap those buttons, but
-- freely editable. NULL = no note.
ALTER TABLE public.v2_boxes_payouts ADD COLUMN IF NOT EXISTS note TEXT;
