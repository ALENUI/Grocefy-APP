-- App releases: every installable build the EAS workflow finishes is recorded here by the publish-release Edge
-- Function. Installed apps compare their own build number with the newest row for their platform and offer the
-- download when a newer build exists. Readable by everyone (also before sign-in); only the service role writes.

create table public.app_releases (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ios', 'android')),
  build_number integer not null check (build_number > 0), -- Android versionCode / iOS buildNumber
  version text not null,                                   -- user-facing version, e.g. 1.0.0
  download_url text not null check (download_url ~ '^https://'),
  notes text,
  eas_build_id text,
  created_at timestamptz not null default now(),
  unique (platform, build_number)
);

alter table public.app_releases enable row level security;
create policy "app releases: anyone reads" on public.app_releases for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.app_releases from anon, authenticated;
