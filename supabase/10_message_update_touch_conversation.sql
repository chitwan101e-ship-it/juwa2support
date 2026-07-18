-- Bump parent conversation on message INSERT *and* UPDATE (e.g. mark-as-read)
-- so staff dashboard can rely on filtered conversations realtime instead of
-- subscribing to all messages platform-wide.

drop trigger if exists messages_touch_conversation on public.messages;

create trigger messages_touch_conversation
  after insert or update on public.messages
  for each row execute function public.touch_conversation_on_message();
