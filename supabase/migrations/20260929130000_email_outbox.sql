-- Transactional email outbox. Database events enqueue emails; the send-emails Edge Function claims them, renders
-- them from current data, and delivers them through the configured provider. Email delivery is therefore decoupled
-- from database logic: a provider outage never blocks an invitation or a report, and failed sends are retried.

alter table public.user_settings add column email_notifications boolean not null default true;
grant update (email_notifications) on public.user_settings to authenticated;

create type public.email_kind as enum ('invitation', 'monthly_report');
create type public.email_status as enum ('pending', 'sending', 'sent', 'failed', 'skipped');

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind public.email_kind not null,
  to_email text not null,
  recipient_id uuid references public.profiles(id) on delete cascade, -- null for invitations to unregistered addresses
  reference_id uuid not null, -- invitation id or monthly report id; the worker renders from current data
  status public.email_status not null default 'pending',
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (kind, reference_id, to_email)
);
create index email_outbox_due_idx on public.email_outbox (next_attempt_at) where status in ('pending', 'failed', 'sending');

-- Server-only: no policies, and no privileges for the API roles.
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

create function public.wants_email(user_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select s.email_notifications from public.user_settings s where s.user_id = wants_email.user_id), true)
$$;
revoke execute on function public.wants_email(uuid) from public, anon, authenticated;

-- New invitations email the invitee: the address given for email invitations, or the registered address for
-- username/id invitations (which the inviter never sees). Re-invites refresh the row and do not re-send.
create function public.enqueue_invitation_email() returns trigger language plpgsql security definer set search_path = public as $$
declare address text := lower(new.invitee_email);
begin
  if new.invitee_user_id is not null then
    if not public.wants_email(new.invitee_user_id) then return new; end if;
    select lower(email) into address from auth.users where id = new.invitee_user_id;
  end if;
  if address is not null then
    insert into public.email_outbox (kind, to_email, recipient_id, reference_id) values ('invitation', address, new.invitee_user_id, new.id)
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger invitations_email after insert on public.invitations for each row execute function public.enqueue_invitation_email();

-- Finalized monthly reports email each notified owner and partner.
create function public.enqueue_report_email() returns trigger language plpgsql security definer set search_path = public as $$
declare address text;
begin
  if new.type <> 'MONTHLY_REPORT' or new.resource_id is null or not public.wants_email(new.user_id) then return new; end if;
  select lower(email) into address from auth.users where id = new.user_id;
  if address is not null then
    insert into public.email_outbox (kind, to_email, recipient_id, reference_id) values ('monthly_report', address, new.user_id, new.resource_id)
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger notifications_email after insert on public.notifications for each row execute function public.enqueue_report_email();

-- Worker API (service role only). Claims due emails with row locks so concurrent workers never double-send; rows
-- stuck in 'sending' for 10 minutes (a crashed worker) become claimable again.
create function public.claim_email_batch(batch_size integer default 20) returns setof public.email_outbox
language sql security definer set search_path = public as $$
  update public.email_outbox o set status = 'sending', attempts = o.attempts + 1, locked_at = now()
  where o.id in (
    select id from public.email_outbox
    where (status in ('pending', 'failed') and next_attempt_at <= now()) or (status = 'sending' and locked_at < now() - interval '10 minutes')
    order by created_at limit greatest(1, least(batch_size, 100)) for update skip locked
  )
  returning o.*
$$;

-- Records the outcome. Failures retry with exponential backoff (1, 4, 16, 64 minutes) and stop after 5 attempts.
create function public.complete_email(email_id uuid, outcome public.email_status, error_message text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if outcome not in ('sent', 'failed', 'skipped') then raise exception 'VALIDATION_ERROR'; end if;
  update public.email_outbox set
    status = outcome,
    sent_at = case when outcome = 'sent' then now() end,
    last_error = left(error_message, 1000),
    locked_at = null,
    -- after the final attempt, push the retry time out of reach so the row is no longer claimed
    next_attempt_at = case when outcome = 'failed' and attempts < 5 then now() + (interval '1 minute' * power(4, attempts - 1)) else 'infinity' end
  where id = email_id and status = 'sending';
end $$;

revoke execute on function public.claim_email_batch(integer) from public, anon, authenticated;
revoke execute on function public.complete_email(uuid, public.email_status, text) from public, anon, authenticated;
grant execute on function public.claim_email_batch(integer) to service_role;
grant execute on function public.complete_email(uuid, public.email_status, text) to service_role;
grant select, insert, update on public.email_outbox to service_role;

-- On Supabase, run the worker every minute. The job only fires once the project URL and worker secret are stored in
-- Vault (see README), so applying this migration never calls an unconfigured endpoint.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') and exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('grocefy-send-emails', '* * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'grocefy_project_url') || '/functions/v1/send-emails',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'grocefy_email_worker_secret')),
        body := '{}'::jsonb)
      where exists (select 1 from vault.decrypted_secrets where name = 'grocefy_project_url')
        and exists (select 1 from vault.decrypted_secrets where name = 'grocefy_email_worker_secret')
        and exists (select 1 from public.email_outbox where status in ('pending', 'failed', 'sending') and next_attempt_at <= now())
    $job$);
  end if;
end $$;
