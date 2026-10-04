-- Push notifications. Devices register Expo push tokens; database events queue pushes in push_outbox; the send-push
-- Edge Function delivers them through Expo's push service. Like email, delivery never runs inside a transaction.
-- Pushes go out for every in-app notification (invitations, replies, monthly reports) and when someone purchases an
-- item on a list others share, to everyone else who can see the list.

alter table public.user_settings add column push_notifications boolean not null default true;
grant update (push_notifications) on public.user_settings to authenticated;

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (token ~ '^Expo(nent)?PushToken\[.+\]$'),
  platform text check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy "push tokens: read own" on public.push_tokens for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.push_tokens from anon, authenticated;

-- A token belongs to the device's current user: signing in as someone else on the same phone moves it.
create function public.register_push_token(token text, platform text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if token is null or token !~ '^Expo(nent)?PushToken\[.+\]$' or (platform is not null and platform not in ('ios', 'android')) then raise exception 'VALIDATION_ERROR'; end if;
  insert into public.push_tokens (user_id, token, platform) values (auth.uid(), register_push_token.token, register_push_token.platform)
  on conflict on constraint push_tokens_token_key do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end $$;

create function public.unregister_push_token(token text) returns void language sql security definer set search_path = public as $$
  delete from public.push_tokens t where t.token = unregister_push_token.token and t.user_id = auth.uid()
$$;

create table public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null default '{}', -- e.g. {"url": "/list/<id>"}: where tapping the notification opens the app
  dedupe_key text unique, -- one push per event and recipient
  status public.email_status not null default 'pending',
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index push_outbox_due_idx on public.push_outbox (next_attempt_at) where status in ('pending', 'failed', 'sending');
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;

create function public.wants_push(user_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select s.push_notifications from public.user_settings s where s.user_id = wants_push.user_id), true)
    and exists (select 1 from public.push_tokens t where t.user_id = wants_push.user_id)
$$;
revoke execute on function public.wants_push(uuid) from public, anon, authenticated;

create function public.queue_push(recipient uuid, title text, body text, data jsonb, dedupe_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.wants_push(recipient) then
    insert into public.push_outbox (user_id, title, body, data, dedupe_key) values (recipient, title, body, coalesce(data, '{}'), dedupe_key)
    on conflict on constraint push_outbox_dedupe_key_key do nothing;
  end if;
end $$;
revoke execute on function public.queue_push(uuid, text, text, jsonb, text) from public, anon, authenticated;

-- Every in-app notification is also pushed, opening the screen it concerns.
create function public.push_notification() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.queue_push(new.user_id, new.title, new.message,
    jsonb_build_object('url', case
      when new.type = 'INVITATION' then '/inbox'
      when new.type = 'MONTHLY_REPORT' then '/reports'
      when new.resource_type = 'list' and new.resource_id is not null then '/list/' || new.resource_id
      when new.resource_type = 'group' and new.resource_id is not null then '/group/' || new.resource_id
      else '/inbox' end),
    'notification:' || new.id);
  return null;
end $$;
create trigger notifications_push after insert on public.notifications for each row execute function public.push_notification();

-- A purchase notifies everyone else who can see the list: its owner and members, and its group's owner and members.
create function public.push_purchase() returns trigger language plpgsql security definer set search_path = public as $$
declare
  list public.shopping_lists;
  buyer text;
  product text;
  recipient uuid;
begin
  select * into list from public.shopping_lists where id = new.list_id;
  select display_name into buyer from public.profiles where id = new.user_id;
  select name into product from public.products where id = new.product_id;
  for recipient in
    select list.owner_id
    union select m.user_id from public.list_members m where m.list_id = list.id and m.status = 'accepted'
    union select g.owner_id from public.shopping_groups g where g.id = list.group_id
    union select m.user_id from public.group_members m where m.group_id = list.group_id and m.status = 'accepted'
  loop
    continue when recipient is null or recipient = new.user_id;
    perform public.queue_push(recipient, list.name,
      coalesce(buyer, 'Someone') || ' bought ' || coalesce(product, 'an item') || ' for ' || trim_scale(new.purchased_amount) || ' ' || new.currency_code,
      jsonb_build_object('url', '/list/' || list.id), 'purchase:' || new.id || ':' || recipient);
  end loop;
  return null;
end $$;
create trigger purchases_push after insert on public.purchases for each row execute function public.push_purchase();

-- Worker API (service role only), mirroring the email outbox: locked claims, retries with backoff, 5 attempts.
create function public.claim_push_batch(batch_size integer default 50) returns setof public.push_outbox
language sql security definer set search_path = public as $$
  update public.push_outbox o set status = 'sending', attempts = o.attempts + 1, locked_at = now()
  where o.id in (
    select id from public.push_outbox
    where (status in ('pending', 'failed') and next_attempt_at <= now()) or (status = 'sending' and locked_at < now() - interval '10 minutes')
    order by created_at limit greatest(1, least(batch_size, 100)) for update skip locked
  )
  returning o.*
$$;

create function public.complete_push(push_id uuid, outcome public.email_status, error_message text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if outcome not in ('sent', 'failed', 'skipped') then raise exception 'VALIDATION_ERROR'; end if;
  update public.push_outbox set
    status = outcome,
    sent_at = case when outcome = 'sent' then now() end,
    last_error = left(error_message, 1000),
    locked_at = null,
    next_attempt_at = case when outcome = 'failed' and attempts < 5 then now() + (interval '1 minute' * power(4, attempts - 1)) else 'infinity' end
  where id = push_id and status = 'sending';
end $$;

revoke execute on function public.claim_push_batch(integer) from public, anon, authenticated;
revoke execute on function public.complete_push(uuid, public.email_status, text) from public, anon, authenticated;
revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.claim_push_batch(integer) to service_role;
grant execute on function public.complete_push(uuid, public.email_status, text) to service_role;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant select, insert, update, delete on public.push_tokens to service_role;
grant select, insert, update on public.push_outbox to service_role;

-- Run the push worker every minute on Supabase, using the same project URL and worker secret as the email worker.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') and exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('grocefy-send-push', '* * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'grocefy_project_url') || '/functions/v1/send-push',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'grocefy_email_worker_secret')),
        body := '{}'::jsonb)
      where exists (select 1 from vault.decrypted_secrets where name = 'grocefy_project_url')
        and exists (select 1 from vault.decrypted_secrets where name = 'grocefy_email_worker_secret')
        and exists (select 1 from public.push_outbox where status in ('pending', 'failed', 'sending') and next_attempt_at <= now())
    $job$);
  end if;
end $$;
