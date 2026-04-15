-- Fix submitter_id FK: point to public.users so PostgREST joins work
alter table public.best_line_submissions
  drop constraint if exists best_line_submissions_submitter_id_fkey;

alter table public.best_line_submissions
  add constraint best_line_submissions_submitter_id_fkey
  foreign key (submitter_id) references public.users(id) on delete cascade;
