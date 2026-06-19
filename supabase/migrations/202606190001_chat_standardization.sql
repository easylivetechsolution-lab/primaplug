alter table public.notifications
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

alter table public.conversations
  add column if not exists hidden_for uuid[] not null default '{}',
  add column if not exists cleared_at_1 timestamptz,
  add column if not exists cleared_at_2 timestamptz;

create index if not exists conversations_participant_1_idx
  on public.conversations (participant_1, last_message_at desc);

create index if not exists conversations_participant_2_idx
  on public.conversations (participant_2, last_message_at desc);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

create or replace function public.send_chat_message(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_content text,
  p_type text default 'text'
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.conversations%rowtype;
  v_message public.messages%rowtype;
begin
  if p_content is null or length(trim(p_content)) = 0 then
    raise exception 'Message content is required';
  end if;

  select *
    into v_conversation
    from public.conversations
    where id = p_conversation_id
      and (participant_1 = p_sender_id or participant_2 = p_sender_id)
    for update;

  if not found then
    raise exception 'Conversation not found';
  end if;

  insert into public.messages (conversation_id, sender_id, content, type)
  values (p_conversation_id, p_sender_id, trim(p_content), coalesce(p_type, 'text'))
  returning * into v_message;

  update public.conversations
    set last_message = trim(p_content),
        last_message_at = v_message.created_at,
        hidden_for = array_remove(array_remove(hidden_for, v_conversation.participant_1), v_conversation.participant_2),
        unread_count_1 = case
          when v_conversation.participant_1 = p_sender_id then unread_count_1
          else coalesce(unread_count_1, 0) + 1
        end,
        unread_count_2 = case
          when v_conversation.participant_2 = p_sender_id then unread_count_2
          else coalesce(unread_count_2, 0) + 1
        end
    where id = p_conversation_id;

  return v_message;
end;
$$;
