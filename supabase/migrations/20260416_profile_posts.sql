alter table public.profiles
add column if not exists bio text not null default '',
add column if not exists cover_image_url text;

create table if not exists public.profile_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  image_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profile_posts_body_or_image_check
    check (char_length(trim(body)) > 0 or image_url is not null)
);

create index if not exists profile_posts_user_idx on public.profile_posts (user_id, created_at desc);

drop trigger if exists set_profile_posts_updated_at on public.profile_posts;

create trigger set_profile_posts_updated_at
before update on public.profile_posts
for each row
execute function public.set_updated_at();

alter table public.profile_posts enable row level security;

drop policy if exists "profile_posts_select_authenticated" on public.profile_posts;
drop policy if exists "profile_posts_insert_self" on public.profile_posts;
drop policy if exists "profile_posts_update_self" on public.profile_posts;
drop policy if exists "profile_posts_delete_self" on public.profile_posts;

create policy "profile_posts_select_authenticated"
on public.profile_posts
for select
to authenticated
using (true);

create policy "profile_posts_insert_self"
on public.profile_posts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "profile_posts_update_self"
on public.profile_posts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "profile_posts_delete_self"
on public.profile_posts
for delete
to authenticated
using ((select auth.uid()) = user_id);
