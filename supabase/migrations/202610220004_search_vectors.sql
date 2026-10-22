alter table public.gigs
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(field, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(location, '')), 'C')
  ) stored;

alter table public.users
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('simple'::regconfig, coalesce(full_name, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(username, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(skills::text, '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(bio, '')), 'C')
  ) stored;

create index if not exists gigs_search_vector_idx
  on public.gigs using gin (search_vector);

create index if not exists users_search_vector_idx
  on public.users using gin (search_vector);
