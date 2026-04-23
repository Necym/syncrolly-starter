create table if not exists public.profile_post_likes (
  post_id uuid not null references public.profile_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (post_id, user_id)
);

create index if not exists profile_post_likes_post_idx
  on public.profile_post_likes (post_id, created_at desc);

alter table public.profile_post_likes enable row level security;

drop policy if exists "profile_post_likes_select_authenticated" on public.profile_post_likes;
drop policy if exists "profile_post_likes_insert_self" on public.profile_post_likes;
drop policy if exists "profile_post_likes_delete_self" on public.profile_post_likes;

create policy "profile_post_likes_select_authenticated"
on public.profile_post_likes
for select
to authenticated
using (true);

create policy "profile_post_likes_insert_self"
on public.profile_post_likes
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "profile_post_likes_delete_self"
on public.profile_post_likes
for delete
to authenticated
using ((select auth.uid()) = user_id);
