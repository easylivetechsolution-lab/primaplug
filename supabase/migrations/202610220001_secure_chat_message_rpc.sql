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
  if auth.uid() is null or auth.uid() <> p_sender_id then
    raise exception 'Sender must match the authenticated user';
  end if;

  if p_content is null or length(trim(p_content)) = 0 then
    raise exception 'Message content is required';
  end if;

  select *
    into v_conversation
    from public.conversations
    where id = p_conversation_id
      and (participant_1 = auth.uid() or participant_2 = auth.uid())
    for update;

  if not found then
    raise exception 'Conversation not found';
  end if;

  insert into public.messages (conversation_id, sender_id, content, type)
  values (p_conversation_id, auth.uid(), trim(p_content), coalesce(p_type, 'text'))
  returning * into v_message;

  update public.conversations
    set last_message = trim(p_content),
        last_message_at = v_message.created_at,
        hidden_for = array_remove(array_remove(hidden_for, v_conversation.participant_1), v_conversation.participant_2),
        unread_count_1 = case
          when v_conversation.participant_1 = auth.uid() then unread_count_1
          else coalesce(unread_count_1, 0) + 1
        end,
        unread_count_2 = case
          when v_conversation.participant_2 = auth.uid() then unread_count_2
          else coalesce(unread_count_2, 0) + 1
        end
    where id = p_conversation_id;

  return v_message;
end;
$$;

revoke all on function public.send_chat_message(uuid, uuid, text, text) from public, anon;
grant execute on function public.send_chat_message(uuid, uuid, text, text) to authenticated;
