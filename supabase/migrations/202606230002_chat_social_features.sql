-- Pin and mute per-participant on conversations
alter table public.conversations
  add column if not exists pinned_1  boolean default false,
  add column if not exists pinned_2  boolean default false,
  add column if not exists muted_1   boolean default false,
  add column if not exists muted_2   boolean default false;

-- Reply threading and emoji reactions on messages
alter table public.messages
  add column if not exists reply_to_id          uuid references public.messages(id) on delete set null,
  add column if not exists reply_to_content     text,
  add column if not exists reply_to_sender_name text,
  add column if not exists reactions            jsonb default '{}';

-- Fast lookup when loading replies
create index if not exists messages_reply_to_idx
  on public.messages (reply_to_id)
  where reply_to_id is not null;
