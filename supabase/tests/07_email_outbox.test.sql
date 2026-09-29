-- Email outbox: what gets queued, opt-outs, access, and the worker claim/complete/retry cycle.
begin;
select tests.household();
select tests.create_user('newcomer');
select tests.create_user('quiet');
update public.user_settings set email_notifications = false where user_id = tests.id('quiet');

select tests.login('owner');
select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'editor', 'newcomer');
select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'partner', 'newcomer');
select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'viewer', 'Someone@Example.test');
select public.create_invitation('list', '20000000-0000-0000-0000-000000000001', 'viewer', 'quiet');
select tests.throws($$ select * from public.email_outbox $$, 'permission denied', 'clients cannot read the outbox');
select tests.throws($$ select public.claim_email_batch() $$, 'permission denied', 'clients cannot claim emails');
reset role;

select tests.assert((select count(*) = 1 and bool_and(recipient_id = tests.id('newcomer')) from public.email_outbox where to_email = 'newcomer@example.test'),
  'a username invitation emails the registered address once, even when re-invited');
select tests.assert(exists (select 1 from public.email_outbox where to_email = 'someone@example.test' and recipient_id is null), 'an email invitation emails the given address');
select tests.assert(not exists (select 1 from public.email_outbox where to_email = 'quiet@example.test'), 'users who opted out are not emailed');

insert into public.notifications (user_id, type, title, message, resource_type, resource_id)
values (tests.id('partner'), 'MONTHLY_REPORT', 'September 2026 finance report (XAF)', 'Budget 1 · Actual 1 XAF', 'monthly_report', gen_random_uuid()),
       (tests.id('quiet'), 'MONTHLY_REPORT', 'September 2026 finance report (XAF)', 'Budget 1 · Actual 1 XAF', 'monthly_report', gen_random_uuid()),
       (tests.id('partner'), 'INVITATION_ACCEPTED', 'x joined Food', 'Role: Editor', 'list', gen_random_uuid());
select tests.assert((select count(*) = 1 from public.email_outbox where kind = 'monthly_report'), 'report notifications are emailed to opted-in users only');

-- Users manage their own preference.
select tests.login('quiet');
update public.user_settings set email_notifications = true;
select tests.assert((select email_notifications from public.user_settings), 'users can opt back in');
reset role;

-- Worker cycle, as the service role used by the Edge Function.
select set_config('role', 'service_role', true);
select tests.assert((select count(*) = 3 from public.claim_email_batch(10)), 'the worker claims every due email');
select tests.assert((select count(*) = 0 from public.claim_email_batch(10)), 'claimed emails are not handed out twice');
select public.complete_email(id, 'sent') from public.email_outbox where to_email = 'newcomer@example.test';
select public.complete_email(id, 'skipped', 'invitation no longer pending') from public.email_outbox where to_email = 'someone@example.test';
select public.complete_email(id, 'failed', 'provider timeout') from public.email_outbox where kind = 'monthly_report';
select tests.assert((select status = 'sent' and sent_at is not null from public.email_outbox where to_email = 'newcomer@example.test'), 'sent emails are recorded');
select tests.assert((select status = 'failed' and last_error = 'provider timeout' and next_attempt_at > now() from public.email_outbox where kind = 'monthly_report'),
  'failures are scheduled for a retry');
select tests.assert((select count(*) = 0 from public.claim_email_batch(10)), 'retries wait for their backoff');
reset role;

-- Retries stop after five attempts.
update public.email_outbox set next_attempt_at = now() - interval '1 second', attempts = 4 where kind = 'monthly_report';
select set_config('role', 'service_role', true);
select tests.assert((select count(*) = 1 and bool_and(attempts = 5) from public.claim_email_batch(10)), 'a due retry is claimed again');
select public.complete_email(id, 'failed', 'provider timeout') from public.email_outbox where kind = 'monthly_report';
reset role;
select tests.assert((select next_attempt_at = 'infinity' from public.email_outbox where kind = 'monthly_report'), 'no further retries after the fifth attempt');

-- A worker that crashed mid-send releases its claim after 10 minutes.
insert into public.email_outbox (kind, to_email, reference_id, status, attempts, locked_at)
values ('invitation', 'stale@example.test', gen_random_uuid(), 'sending', 1, now() - interval '11 minutes');
select set_config('role', 'service_role', true);
select tests.assert((select count(*) = 1 and bool_and(to_email = 'stale@example.test') from public.claim_email_batch(10)), 'stale claims are recovered');
reset role;

rollback;
