-- Rookie nomination system: Loozers can nominate new rookies for admin approval

create table if not exists public.rookie_nominations (
  id uuid primary key default gen_random_uuid(),
  nominator_id uuid not null references public.users(id) on delete cascade,
  phone varchar(15) not null,
  first_name varchar(100) not null,
  last_name varchar(100) not null,
  status varchar(20) not null default 'pending',
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  invite_message text,
  created_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Prevent duplicate pending nominations for the same phone
create unique index if not exists idx_nominations_pending_phone
  on public.rookie_nominations(phone)
  where status = 'pending';

-- Updated_at trigger
create trigger rookie_nominations_updated_at
  before update on public.rookie_nominations
  for each row execute function update_updated_at();

-- RLS
alter table public.rookie_nominations enable row level security;

create policy "Users can read own nominations"
  on public.rookie_nominations for select
  using (nominator_id = auth.uid() or is_admin());

create policy "Users can insert nominations"
  on public.rookie_nominations for insert
  with check (nominator_id = auth.uid());

create policy "Admins can update nominations"
  on public.rookie_nominations for update
  using (is_admin());

create policy "Admins can delete nominations"
  on public.rookie_nominations for delete
  using (is_admin());
