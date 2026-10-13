-- Minimal stand-in for the Supabase platform so migrations, RLS policies, and grants can be
-- tested on plain PostgreSQL 15. Never apply this file to a real Supabase project.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create schema extensions;
grant usage on schema auth, extensions to anon, authenticated, service_role;
create extension pgcrypto with schema extensions; -- Supabase keeps extensions out of the API schema

create table auth.users (
  id uuid primary key default gen_random_uuid(), email text unique, email_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Same claim resolution as Supabase: PostgREST exposes the verified JWT through request.jwt.claims.
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;

-- Supabase grants every API role full privileges on new public objects; RLS and explicit revokes do the rest.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
