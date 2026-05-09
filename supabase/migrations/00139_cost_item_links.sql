-- Issue #125 Phase 3a — link cost_items to the trip_options they fund.
--
-- Goal: cost_items becomes the EXCLUSIVE source of price data. After this
-- migration + backfill + helper-based reads, every option's cost is computed
-- from its linked cost_items. trip_options.cost stays as a fallback for
-- unlinked options during the transition (and as a safety net).
--
-- One cost item can fund one trip_option, but may contribute to multiple
-- choices on that option (e.g. Lodge Tue funds both the "Mon & Tue night"
-- and "Tue night" choices on Extra Hotel Nights). Hence the junction table
-- on choice_value.

ALTER TABLE public.cost_items
  ADD COLUMN IF NOT EXISTS linked_option_id UUID
    REFERENCES public.trip_options(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cost_items_linked_option
  ON public.cost_items(linked_option_id)
  WHERE linked_option_id IS NOT NULL;

-- Junction: cost item ↔ choice value(s) on the linked option.
-- Empty (no rows) = the cost applies to the option's flat cost (checkbox
-- type) or to "Yes" on a yes/no select (we'll treat empty as "default
-- choice" in the compute helper).
CREATE TABLE IF NOT EXISTS public.cost_item_option_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_item_id UUID NOT NULL REFERENCES public.cost_items(id) ON DELETE CASCADE,
  choice_value VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cost_item_id, choice_value)
);

CREATE INDEX IF NOT EXISTS idx_cost_item_option_choices_cost_item
  ON public.cost_item_option_choices(cost_item_id);

ALTER TABLE public.cost_item_option_choices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cost_item_option_choices"
  ON public.cost_item_option_choices FOR SELECT TO authenticated USING (true);

CREATE POLICY "Finance admins can manage cost_item_option_choices"
  ON public.cost_item_option_choices FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND (is_admin = true OR (permissions->>'manage_finances')::boolean = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND (is_admin = true OR (permissions->>'manage_finances')::boolean = true)
    )
  );
