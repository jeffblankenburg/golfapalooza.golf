-- Best Line submissions: capture funny quotes/stories during the trip
create table if not exists public.best_line_submissions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trip_settings(id) on delete cascade,
  submitter_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(trim(text)) > 0),
  created_at timestamptz not null default now()
);

-- Index for efficient lookups by trip
create index if not exists idx_best_line_submissions_trip
  on public.best_line_submissions(trip_id, created_at desc);

-- Index for user's own submissions
create index if not exists idx_best_line_submissions_user
  on public.best_line_submissions(submitter_id, created_at desc);

-- RLS
alter table public.best_line_submissions enable row level security;

-- SELECT: users see their own; admins / manage_best_line see all
drop policy if exists "best_line_select" on public.best_line_submissions;
create policy "best_line_select" on public.best_line_submissions
  for select using (
    submitter_id = auth.uid()
    or exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and (
        u.is_admin = true
        or (u.permissions->>'manage_best_line')::boolean = true
      )
    )
  );

-- INSERT: any authenticated user (must be their own submitter_id)
drop policy if exists "best_line_insert" on public.best_line_submissions;
create policy "best_line_insert" on public.best_line_submissions
  for insert with check (
    submitter_id = auth.uid()
  );

-- DELETE: own submissions or admin/manage_best_line
drop policy if exists "best_line_delete" on public.best_line_submissions;
create policy "best_line_delete" on public.best_line_submissions
  for delete using (
    submitter_id = auth.uid()
    or exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and (
        u.is_admin = true
        or (u.permissions->>'manage_best_line')::boolean = true
      )
    )
  );
