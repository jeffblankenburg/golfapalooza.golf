-- Users table (linked to auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  phone varchar(15) not null unique,
  display_name varchar(100) not null,
  full_name varchar(100),
  is_admin boolean default false,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.users enable row level security;

-- Helper function to check admin status
create or replace function is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.users
    where id = auth.uid() and is_admin = true
  );
end;
$$ language plpgsql security definer;

-- RLS Policies for users table

-- Anyone can read users (for leaderboard, player lists, etc.)
create policy "Anyone can read users" on users
  for select using (true);

-- Users can update their own profile
create policy "Users can update own profile" on users
  for update using (auth.uid() = id);

-- Admins can insert users
create policy "Admins can insert users" on users
  for insert with check (is_admin());

-- Admins can update all users
create policy "Admins can update all users" on users
  for update using (is_admin());

-- Admins can delete users
create policy "Admins can delete users" on users
  for delete using (is_admin());

-- Auto-update updated_at timestamp
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at
  before update on users
  for each row
  execute function update_updated_at();
