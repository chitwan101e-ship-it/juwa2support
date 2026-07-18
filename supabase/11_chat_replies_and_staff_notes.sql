-- STEP 11: Chat reply-to + staff game username note on conversations
-- Run after 10_message_update_touch_conversation.sql — safe to re-run

alter table public.messages
  add column if not exists reply_to_message_id uuid references public.messages(id) on delete set null;

comment on column public.messages.reply_to_message_id is
  'Optional parent message when replying inline (Messenger / iMessage style).';

create index if not exists idx_messages_reply_to
  on public.messages(reply_to_message_id)
  where reply_to_message_id is not null;

alter table public.conversations
  add column if not exists staff_game_username text;

comment on column public.conversations.staff_game_username is
  'Staff-only in-game username note shown beside the customer name in inbox chat.';

alter table public.conversations
  drop constraint if exists conversations_staff_game_username_len;

alter table public.conversations
  add constraint conversations_staff_game_username_len
  check (staff_game_username is null or char_length(trim(staff_game_username)) between 1 and 64);
