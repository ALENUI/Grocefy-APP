-- Live collaboration: publish changes to the tables people watch while shopping together. Supabase Realtime checks
-- each subscriber's SELECT policies before delivering a change, so members only receive rows they can already read.
-- DELETE events carry only the primary key (RLS cannot be evaluated on a deleted row); clients refetch on any event.
do $$
declare target text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach target in array array['shopping_lists', 'list_items', 'purchases', 'list_members', 'group_members', 'notifications', 'invitations'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;
