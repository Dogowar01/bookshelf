-- Bookshelf sync: run this once in your Supabase project's SQL Editor.
-- It creates the books table, a private photo bucket, and rules so each
-- signed-in person can only ever see and change their own books.

create table if not exists public.books (
  user_id    uuid    not null default auth.uid() references auth.users on delete cascade,
  id         text    not null,
  data       jsonb   not null default '{}',
  deleted    boolean not null default false,
  updated_at bigint  not null,                       -- when the book was last edited (on the device)
  synced_at  timestamptz not null default now(),     -- when the server received it
  primary key (user_id, id)
);

create index if not exists books_user_synced on public.books (user_id, synced_at);

-- Stamp every write with the server's clock so devices can ask "what changed since…".
create or replace function public.books_touch() returns trigger
language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists books_touch on public.books;
create trigger books_touch before insert or update on public.books
  for each row execute function public.books_touch();

alter table public.books enable row level security;
drop policy if exists "Own books" on public.books;
create policy "Own books" on public.books for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Photos live in a private bucket, in a folder named after each user's id.
insert into storage.buckets (id, name, public)
values ('book-photos', 'book-photos', false)
on conflict (id) do nothing;

drop policy if exists "Own book photos" on storage.objects;
create policy "Own book photos" on storage.objects for all to authenticated
  using (bucket_id = 'book-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'book-photos' and (storage.foldername(name))[1] = auth.uid()::text);
